/** Verifies task use cases through real domain objects and in-memory port adapters. */
import { describe, expect, it } from 'vitest';

import type { AuthorizationPort } from '../../authorization/public/authorization.port.js';
import { AppError } from '../../common/application/app-error.js';
import type { Actor } from '../../identity/public/actor.js';
import type { IdentityDirectoryPort } from '../../identity/public/identity-directory.port.js';
import { ListDemoActors } from '../../identity/application/use-cases/list-demo-actors.js';
import { DomainError } from '../domain/domain-error.js';
import { Task } from '../domain/task.js';
import type { TaskQueryPort } from './ports/task-query.port.js';
import type { TaskRepositoryPort } from './ports/task-repository.port.js';
import type { TaskTransactionPort } from './ports/task-transaction.port.js';
import type { TaskReadModel } from './read-models/task-read-model.js';
import { ActOnTask } from './use-cases/act-on-task.js';
import { AddTaskComment } from './use-cases/add-task-comment.js';
import { CreateTask } from './use-cases/create-task.js';
import { DeleteTaskComment } from './use-cases/delete-task-comment.js';
import { EditTaskComment } from './use-cases/edit-task-comment.js';
import { GetTask } from './use-cases/get-task.js';
import { ListTasks } from './use-cases/list-tasks.js';
import { RenewExpiredTask } from './use-cases/renew-expired-task.js';
import { ResetDemoTasks } from './use-cases/reset-demo-tasks.js';

const ALLOW_ALL_AUTHORIZATION: AuthorizationPort = {
  hasPermission: () => Promise.resolve(true),
};

const ACTORS: Actor[] = [
  {
    id: 'noticeboard-master',
    username: 'noticeboard-master',
    name: '用户 A',
    role: 'user',
  },
  {
    id: 'adventurer-a',
    username: 'adventurer-a',
    name: '用户 B',
    role: 'user',
  },
  {
    id: 'adventurer-b',
    username: 'adventurer-b',
    name: '用户 C',
    role: 'user',
  },
];
const FIXED_CLOCK = {
  read: () => ({
    instant: '2026-08-30T09:00:00.000Z',
    currentDate: '2026-08-30',
  }),
};
const ACTION_CLOCK = {
  read: () => ({
    instant: '2026-08-30T10:00:00.000Z',
    currentDate: '2026-08-30',
  }),
};

/** Creates a deterministic business clock for command-response projection tests. */
function clockAt(instant: string) {
  return {
    read: () => ({ instant, currentDate: instant.slice(0, 10) }),
  };
}

/** Supplies the fixed demo identity directory used by application tests. */
class MemoryIdentityDirectory implements IdentityDirectoryPort {
  /** Returns actors in their public display order. */
  list(): Promise<Actor[]> {
    return Promise.resolve(ACTORS.map((actor) => ({ ...actor })));
  }

  /** Finds one actor without applying a fallback identity. */
  findById(id: string): Promise<Actor | null> {
    const actor = ACTORS.find((candidate) => candidate.id === id);
    return Promise.resolve(actor ? { ...actor } : null);
  }
}

/** Persists detached task aggregates and emulates optimistic version checks. */
class MemoryTaskRepository implements TaskRepositoryPort {
  private snapshots = new Map<string, ReturnType<Task['toSnapshot']>>();

  /** Restores a task by identifier. */
  findById(id: string): Promise<Task | null> {
    const snapshot = this.snapshots.get(id);
    return Promise.resolve(snapshot ? Task.restore(snapshot) : null);
  }

  /** Inserts a task and rejects duplicate identifiers. */
  insert(task: Task): Promise<void> {
    const snapshot = task.toSnapshot();
    if (this.snapshots.has(snapshot.id))
      throw new AppError('CONFLICT', '任务标识冲突');
    this.snapshots.set(snapshot.id, snapshot);
    return Promise.resolve();
  }

  /** Saves only when the stored version matches the caller's expectation. */
  save(task: Task, expectedVersion: number): Promise<void> {
    const snapshot = task.toSnapshot();
    if (this.snapshots.get(snapshot.id)?.version !== expectedVersion) {
      throw new AppError('CONFLICT', '任务已被其他操作更新');
    }
    this.snapshots.set(snapshot.id, snapshot);
    return Promise.resolve();
  }

  /** Replaces all demo tasks atomically inside the surrounding memory transaction. */
  replaceAll(tasks: Task[]): Promise<void> {
    this.snapshots = new Map(
      tasks.map((task) => [task.toSnapshot().id, task.toSnapshot()]),
    );
    return Promise.resolve();
  }

  /** Exposes detached snapshots for assertions without adding test hooks to production code. */
  values(): ReturnType<Task['toSnapshot']>[] {
    return [...this.snapshots.values()].map((snapshot) =>
      Task.restore(snapshot).toSnapshot(),
    );
  }
}

/** Runs use-case callbacks against the same repository capability. */
class MemoryTransaction implements TaskTransactionPort {
  /** Provides the task repository scoped to one logical transaction. */
  constructor(private readonly repository: MemoryTaskRepository) {}

  /** Executes work with the only capability required by task mutations. */
  run<T>(work: (repository: TaskRepositoryPort) => Promise<T>): Promise<T> {
    return work(this.repository);
  }
}

/** Returns explicitly configured read projections. */
class MemoryTaskQuery implements TaskQueryPort {
  /** Initializes deterministic list and detail responses. */
  constructor(private readonly models: TaskReadModel[]) {}

  /** Lists the configured projections in repository-defined order. */
  list(): Promise<TaskReadModel[]> {
    return Promise.resolve(this.models);
  }

  /** Returns one configured projection by identifier. */
  getById(id: string): Promise<TaskReadModel | null> {
    return Promise.resolve(
      this.models.find((model) => model.id === id) ?? null,
    );
  }
}

/** Creates a deterministic task through the mutation use case. */
async function publish(
  repository: MemoryTaskRepository,
  actorId = ACTORS[0]!.id,
): Promise<Task> {
  const useCase = new CreateTask(
    new MemoryTransaction(repository),
    new MemoryIdentityDirectory(),
    () => 'task-created',
    FIXED_CLOCK,
  );
  await useCase.execute(actorId, {
    title: '  新委托  ',
    type: 'collection',
    description: '  收集月光药草  ',
    reward: '  18 金币  ',
    dueDate: '2026-09-04',
  });
  return (await repository.findById('task-created'))!;
}

describe('task application use cases', () => {
  it('lists demo actors without inventing an authentication fallback', async () => {
    await expect(
      new ListDemoActors(new MemoryIdentityDirectory()).execute(),
    ).resolves.toEqual(ACTORS);
  });

  it('creates a task with the resolved demo actor in one transaction', async () => {
    const repository = new MemoryTaskRepository();

    const task = await publish(repository, ACTORS[1]!.id);

    expect(task.toSnapshot()).toMatchObject({
      id: 'task-created',
      title: '新委托',
      publisher: ACTORS[1],
      status: 'not_started',
    });
  });

  it('returns a newly created task through the effective-status projection', async () => {
    const repository = new MemoryTaskRepository();
    const clock = Object.assign(() => '2026-09-02T04:00:00.000Z', {
      read: () => ({
        instant: '2026-09-02T04:00:00.000Z',
        currentDate: '2026-09-02',
      }),
    });
    const useCase = new CreateTask(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      () => 'task-expired-on-create',
      clock,
    );

    await expect(
      useCase.execute(ACTORS[0]!.id, {
        title: '历史委托',
        type: 'collection',
        description: '创建后应立即投影为失效',
        reward: '18 金币',
        dueDate: '2026-09-01',
      }),
    ).resolves.toMatchObject({
      workflowStatus: 'not_started',
      status: 'expired',
    });
  });

  it('rejects an unknown demo actor before creating a task', async () => {
    const repository = new MemoryTaskRepository();
    const useCase = new CreateTask(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      () => 'task-created',
      FIXED_CLOCK,
    );

    await expect(
      useCase.execute('unknown', {
        title: '新委托',
        type: 'collection',
        description: '收集月光药草',
        reward: '18 金币',
        dueDate: '2026-09-04',
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_IDENTITY' });
    expect(repository.values()).toEqual([]);
  });

  it('applies an action only at the expected version', async () => {
    const repository = new MemoryTaskRepository();
    await publish(repository);
    const useCase = new ActOnTask(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      ACTION_CLOCK,
    );

    await expect(
      useCase.execute(ACTORS[1]!.id, 'task-created', 'accept', 99),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(
      useCase.execute(ACTORS[1]!.id, 'task-created', 'accept', 1),
    ).resolves.toBeUndefined();
    expect(
      (await repository.findById('task-created'))!.toSnapshot(),
    ).toMatchObject({
      assignee: ACTORS[1],
      status: 'in_progress',
      version: 2,
    });
  });

  it('rejects ordinary actions when the injected business date has expired the task', async () => {
    const repository = new MemoryTaskRepository();
    await repository.insert(
      Task.create(
        {
          id: 'task-expired',
          title: '失效任务',
          type: 'exploration',
          description: '验证动作门禁',
          reward: '10 金币',
          dueDate: '2026-09-01',
        },
        ACTORS[0]!,
        '2026-08-30T09:00:00.000Z',
      ),
    );
    const clock = Object.assign(() => '2026-09-02T04:00:00.000Z', {
      read: () => ({
        instant: '2026-09-02T04:00:00.000Z',
        currentDate: '2026-09-02',
      }),
    });
    const useCase = new ActOnTask(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      clock,
    );

    await expect(
      useCase.execute(ACTORS[1]!.id, 'task-expired', 'accept', 1),
    ).rejects.toMatchObject({ code: 'TASK_EXPIRED' });
    expect(
      (await repository.findById('task-expired'))!.toSnapshot(),
    ).toMatchObject({ status: 'not_started', version: 1, assignee: null });
  });

  it('renews an expired task atomically at the expected version', async () => {
    const repository = new MemoryTaskRepository();
    const task = Task.create(
      {
        id: 'task-expired-renewal',
        title: '失效任务',
        type: 'exploration',
        description: '验证续期用例',
        reward: '10 金币',
        dueDate: '2026-09-01',
      },
      ACTORS[0]!,
      '2026-08-30T09:00:00.000Z',
    );
    task.act('accept', ACTORS[1]!, '2026-08-30T10:00:00.000Z', '2026-08-30');
    await repository.insert(task);
    const useCase = new RenewExpiredTask(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      {
        read: () => ({
          instant: '2026-09-02T04:00:00.000Z',
          currentDate: '2026-09-02',
        }),
      },
    );
    await useCase.execute(ACTORS[0]!.id, 'task-expired-renewal', {
      dueDate: '2026-09-03',
      recoveryStrategy: 'reopened',
      expectedVersion: 2,
    });

    expect(
      (await repository.findById('task-expired-renewal'))!.toSnapshot(),
    ).toMatchObject({
      dueDate: '2026-09-03',
      status: 'reopened',
      assignee: null,
      version: 3,
      timeline: [{}, {}, { action: 'renewed', actor: ACTORS[0] }],
    });
  });

  it('requires review and view permissions before renewing an expired task', async () => {
    const repository = new MemoryTaskRepository();
    await repository.insert(
      Task.create(
        {
          id: 'task-expired-permission',
          title: '失效任务',
          type: 'exploration',
          description: '验证续期权限',
          reward: '10 金币',
          dueDate: '2026-09-01',
        },
        ACTORS[0]!,
        '2026-08-30T09:00:00.000Z',
      ),
    );
    const authorization: AuthorizationPort = {
      hasPermission: (_userId, permission) =>
        Promise.resolve(permission !== 'tasks.review'),
    };
    const useCase = new RenewExpiredTask(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      {
        read: () => ({
          instant: '2026-09-02T04:00:00.000Z',
          currentDate: '2026-09-02',
        }),
      },
      authorization,
    );

    await expect(
      useCase.execute(ACTORS[0]!.id, 'task-expired-permission', {
        dueDate: '2026-09-03',
        recoveryStrategy: 'preserve_status',
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(
      (await repository.findById('task-expired-permission'))!.toSnapshot(),
    ).toMatchObject({ dueDate: '2026-09-01', version: 1 });
  });

  /** Ensures action permission without task-read permission cannot commit a mutation. */
  it('requires task-read permission before committing an action', async () => {
    const repository = new MemoryTaskRepository();
    await publish(repository);
    const authorization: AuthorizationPort = {
      hasPermission: (_userId, permission) =>
        Promise.resolve(permission !== 'tasks.view'),
    };
    const useCase = new ActOnTask(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      ACTION_CLOCK,
      authorization,
    );

    await expect(
      useCase.execute(ACTORS[1]!.id, 'task-created', 'accept', 1),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(
      (await repository.findById('task-created'))!.toSnapshot(),
    ).toMatchObject({
      status: 'not_started',
      version: 1,
    });
  });

  /** Proves comment creation coordinates identity, deterministic providers, and one versioned save. */
  it('adds a comment with the resolved actor, generated ID, and expected version', async () => {
    const repository = new MemoryTaskRepository();
    await publish(repository);
    const useCase = new AddTaskComment(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      ALLOW_ALL_AUTHORIZATION,
      clockAt('2026-08-30T10:00:00.000Z'),
      () => 'comment-created',
    );

    const committed = await useCase.execute(
      ACTORS[1]!.id,
      'task-created',
      '  进度正常\n明日完成  ',
      1,
    );

    expect(committed).toMatchObject({
      id: 'task-created',
      version: 2,
      workflowStatus: 'not_started',
      status: 'not_started',
    });
    expect(committed.timeline.at(-1)).toMatchObject({
      kind: 'comment',
      commentId: 'comment-created',
      content: '进度正常\n明日完成',
      deleted: false,
    });
    expect(
      (await repository.findById('task-created'))!.toSnapshot().timeline.at(-1),
    ).toEqual({
      sequence: 2,
      action: 'comment_created',
      commentId: 'comment-created',
      content: '进度正常\n明日完成',
      actor: ACTORS[1],
      at: '2026-08-30T10:00:00.000Z',
    });
  });

  /** Proves missing tasks.view authority stops comment creation before persistence. */
  it('requires task-read permission before adding a comment', async () => {
    const repository = new MemoryTaskRepository();
    await publish(repository);
    const authorization: AuthorizationPort = {
      hasPermission: (_userId, permission) =>
        Promise.resolve(permission !== 'tasks.view'),
    };
    const useCase = new AddTaskComment(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      authorization,
      clockAt('2026-08-30T10:00:00.000Z'),
      () => 'comment-created',
    );

    await expect(
      useCase.execute(ACTORS[1]!.id, 'task-created', '不能写入', 1),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(
      (await repository.findById('task-created'))!.toSnapshot().timeline,
    ).toHaveLength(1);
  });

  /** Proves optimistic conflicts and closed tasks leave comment history unchanged. */
  it('rejects stale and closed comment creation without committing an event', async () => {
    const repository = new MemoryTaskRepository();
    const task = await publish(repository);
    const useCase = new AddTaskComment(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      ALLOW_ALL_AUTHORIZATION,
      clockAt('2026-08-30T13:00:00.000Z'),
      () => 'comment-created',
    );

    await expect(
      useCase.execute(ACTORS[1]!.id, 'task-created', '版本过期', 99),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    task.act('accept', ACTORS[1]!, '2026-08-30T10:00:00.000Z', '2026-08-30');
    task.act('complete', ACTORS[1]!, '2026-08-30T11:00:00.000Z', '2026-08-30');
    task.act('approve', ACTORS[0]!, '2026-08-30T12:00:00.000Z', '2026-08-30');
    await repository.save(task, 1);
    await expect(
      useCase.execute(ACTORS[1]!.id, 'task-created', '关闭后评论', 4),
    ).rejects.toMatchObject({ code: 'COMMENT_CONFLICT' });
    expect(
      (await repository.findById('task-created'))!.toSnapshot().version,
    ).toBe(4);
  });

  /** Proves comment editing uses the task transaction and returns its committed projection. */
  it('edits an authored comment at the expected version', async () => {
    const repository = new MemoryTaskRepository();
    await publish(repository);
    await new AddTaskComment(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      ALLOW_ALL_AUTHORIZATION,
      clockAt('2026-08-30T10:00:00.000Z'),
      () => 'comment-created',
    ).execute(ACTORS[1]!.id, 'task-created', '原始正文', 1);
    const useCase = new EditTaskComment(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      ALLOW_ALL_AUTHORIZATION,
      clockAt('2026-08-30T11:00:00.000Z'),
    );

    const committed = await useCase.execute(
      ACTORS[1]!.id,
      'task-created',
      'comment-created',
      '  编辑正文  ',
      2,
    );

    expect(committed).toMatchObject({ version: 3 });
    expect(committed.timeline.at(-1)).toMatchObject({
      kind: 'comment',
      commentId: 'comment-created',
      content: '编辑正文',
      edited: true,
      deleted: false,
    });
    expect(
      (await repository.findById('task-created'))!.toSnapshot().timeline.at(-1),
    ).toMatchObject({
      action: 'comment_edited',
      targetCommentId: 'comment-created',
      content: '编辑正文',
      actor: ACTORS[1],
    });
  });

  /** Proves task-read permission and optimistic version are checked before comment editing. */
  it('rejects unauthorized or stale comment editing without appending history', async () => {
    const repository = new MemoryTaskRepository();
    await publish(repository);
    await new AddTaskComment(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      ALLOW_ALL_AUTHORIZATION,
      clockAt('2026-08-30T10:00:00.000Z'),
      () => 'comment-created',
    ).execute(ACTORS[1]!.id, 'task-created', '原始正文', 1);
    const denied = new EditTaskComment(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      { hasPermission: () => Promise.resolve(false) },
      clockAt('2026-08-30T11:00:00.000Z'),
    );
    const allowed = new EditTaskComment(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      ALLOW_ALL_AUTHORIZATION,
      clockAt('2026-08-30T11:00:00.000Z'),
    );

    await expect(
      denied.execute(
        ACTORS[1]!.id,
        'task-created',
        'comment-created',
        '不能写入',
        2,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      allowed.execute(
        ACTORS[1]!.id,
        'task-created',
        'comment-created',
        '版本过期',
        99,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(
      (await repository.findById('task-created'))!.toSnapshot().timeline,
    ).toHaveLength(2);
  });

  /** Proves stable actor ownership is sufficient to append a deletion marker. */
  it('lets the author delete a comment without system management', async () => {
    const repository = new MemoryTaskRepository();
    await publish(repository);
    await new AddTaskComment(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      ALLOW_ALL_AUTHORIZATION,
      clockAt('2026-08-30T10:00:00.000Z'),
      () => 'comment-created',
    ).execute(ACTORS[1]!.id, 'task-created', '作者评论', 1);
    const authorization: AuthorizationPort = {
      hasPermission: (_userId, permission) =>
        Promise.resolve(permission === 'tasks.view'),
    };
    const useCase = new DeleteTaskComment(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      authorization,
      clockAt('2026-08-30T11:00:00.000Z'),
    );

    const committed = await useCase.execute(
      ACTORS[1]!.id,
      'task-created',
      'comment-created',
      2,
    );

    expect(committed).toMatchObject({
      version: 3,
      workflowStatus: 'not_started',
      status: 'not_started',
    });
    expect(committed.timeline.at(-1)).toMatchObject({
      kind: 'comment',
      commentId: 'comment-created',
      content: null,
      deleted: true,
      deletedByUsername: ACTORS[1]!.username,
    });
    expect(
      (await repository.findById('task-created'))!.toSnapshot().timeline.at(-1),
    ).toMatchObject({
      action: 'comment_deleted',
      targetCommentId: 'comment-created',
      actor: ACTORS[1],
    });
  });

  /** Proves deletion consults current system.manage authority instead of an event snapshot. */
  it('uses the actor current system management permission for comment deletion', async () => {
    const repository = new MemoryTaskRepository();
    await publish(repository);
    await new AddTaskComment(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      ALLOW_ALL_AUTHORIZATION,
      clockAt('2026-08-30T10:00:00.000Z'),
      () => 'comment-created',
    ).execute(ACTORS[1]!.id, 'task-created', '管理员可删', 1);
    let canManage = false;
    const authorization: AuthorizationPort = {
      hasPermission: (_userId, permission) =>
        Promise.resolve(
          permission === 'tasks.view' ||
            (permission === 'system.manage' && canManage),
        ),
    };
    const useCase = new DeleteTaskComment(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      authorization,
      clockAt('2026-08-30T11:00:00.000Z'),
    );

    await expect(
      useCase.execute(ACTORS[2]!.id, 'task-created', 'comment-created', 2),
    ).rejects.toMatchObject({ code: 'COMMENT_FORBIDDEN' });
    canManage = true;
    await expect(
      useCase.execute(ACTORS[2]!.id, 'task-created', 'comment-created', 2),
    ).resolves.toMatchObject({ version: 3 });
  });

  /** Proves a missing comment retains its stable domain not-found code. */
  it('reports a missing comment as an application not-found failure', async () => {
    const repository = new MemoryTaskRepository();
    await publish(repository);
    const useCase = new DeleteTaskComment(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      ALLOW_ALL_AUTHORIZATION,
      clockAt('2026-08-30T11:00:00.000Z'),
    );

    try {
      await useCase.execute(ACTORS[0]!.id, 'task-created', 'missing', 1);
      throw new Error('Expected missing comment deletion to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ code: 'COMMENT_NOT_FOUND' });
    }
  });

  /** Proves missing tasks.view authority stops deletion before comment lookup. */
  it('requires task-read permission before deleting a comment', async () => {
    const repository = new MemoryTaskRepository();
    await publish(repository);
    const authorization: AuthorizationPort = {
      hasPermission: () => Promise.resolve(false),
    };
    const useCase = new DeleteTaskComment(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      authorization,
      clockAt('2026-08-30T11:00:00.000Z'),
    );

    await expect(
      useCase.execute(ACTORS[0]!.id, 'task-created', 'missing', 1),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('returns stable not-found errors from mutation and detail use cases', async () => {
    const repository = new MemoryTaskRepository();
    const action = new ActOnTask(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      ACTION_CLOCK,
    );
    const detail = new GetTask(new MemoryTaskQuery([]), FIXED_CLOCK);

    await expect(
      action.execute(ACTORS[0]!.id, 'missing', 'close', 1),
    ).rejects.toMatchObject({
      code: 'TASK_NOT_FOUND',
    });
    await expect(detail.execute('missing')).rejects.toMatchObject({
      code: 'TASK_NOT_FOUND',
    });
  });

  it('derives effective list and detail statuses from the injected business date', async () => {
    const model: TaskReadModel = {
      id: 'read-1',
      title: '失效任务',
      type: 'exploration',
      description: '验证读取投影',
      reward: '10 金币',
      dueDate: '2026-09-01',
      publisher: ACTORS[0]!,
      assignee: ACTORS[1]!,
      status: 'in_progress',
      createdAt: '2026-08-29T09:00:00.000Z',
      updatedAt: '2026-08-29T10:00:00.000Z',
      version: 2,
      timeline: [],
    };
    const query = new MemoryTaskQuery([model]);
    const clock = {
      read: () => ({
        instant: '2026-09-02T04:00:00.000Z',
        currentDate: '2026-09-02',
      }),
    };
    const listTasks = new ListTasks(query, clock);
    const getTask = new GetTask(query, clock);

    await expect(listTasks.execute()).resolves.toMatchObject([
      { id: 'read-1', workflowStatus: 'in_progress', status: 'expired' },
    ]);
    await expect(getTask.execute('read-1')).resolves.toMatchObject({
      id: 'read-1',
      workflowStatus: 'in_progress',
      status: 'expired',
    });
  });

  it('resets exactly twelve demo tasks after validating the actor', async () => {
    const repository = new MemoryTaskRepository();
    await publish(repository);
    const reset = new ResetDemoTasks(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
    );

    await expect(reset.execute('unknown')).rejects.toMatchObject({
      code: 'UNKNOWN_IDENTITY',
    });
    await reset.execute(ACTORS[2]!.id);

    expect(repository.values().map((task) => task.id)).toEqual([
      'task-herbs',
      'task-outpost',
      'task-lanterns',
      'task-starfire',
      'task-village',
      'task-quarry',
      'task-beacon',
      'task-harbor',
      'task-grove',
      'task-portal',
      'task-nether',
      'task-bridge',
    ]);
    expect(repository.values().map((task) => task.status)).toEqual([
      'not_started',
      'in_progress',
      'completed',
      'closed',
      'not_started',
      'in_progress',
      'in_progress',
      'completed',
      'completed',
      'reopened',
      'reopened',
      'closed',
    ]);
  });
});
