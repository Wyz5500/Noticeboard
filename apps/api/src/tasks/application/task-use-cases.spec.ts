/** Verifies task use cases through real domain objects and in-memory port adapters. */
import { describe, expect, it } from 'vitest';

import type { AuthorizationPort } from '../../authorization/application/ports/authorization.port.js';
import { AppError } from '../../common/application/app-error.js';
import type { IdentityDirectoryPort } from '../../identity/application/ports/identity-directory.port.js';
import { ListDemoActors } from '../../identity/application/use-cases/list-demo-actors.js';
import type { Actor } from '../domain/task.types.js';
import { Task } from '../domain/task.js';
import type { TaskQueryPort } from './ports/task-query.port.js';
import type { TaskRepositoryPort } from './ports/task-repository.port.js';
import type { TaskTransactionPort } from './ports/task-transaction.port.js';
import type { TaskReadModel } from './read-models/task-read-model.js';
import { ActOnTask } from './use-cases/act-on-task.js';
import { CreateTask } from './use-cases/create-task.js';
import { GetTask } from './use-cases/get-task.js';
import { ListTasks } from './use-cases/list-tasks.js';
import { ResetDemoTasks } from './use-cases/reset-demo-tasks.js';

const ACTORS: Actor[] = [
  { id: 'guild-master', name: '用户 A', role: 'user' },
  { id: 'adventurer-a', name: '用户 B', role: 'user' },
  { id: 'adventurer-b', name: '用户 C', role: 'user' },
];

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
    () => '2026-08-30T09:00:00.000Z',
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

  it('rejects an unknown demo actor before creating a task', async () => {
    const repository = new MemoryTaskRepository();
    const useCase = new CreateTask(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      () => 'task-created',
      () => '2026-08-30T09:00:00.000Z',
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
      () => '2026-08-30T10:00:00.000Z',
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
      () => '2026-08-30T10:00:00.000Z',
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

  it('returns stable not-found errors from mutation and detail use cases', async () => {
    const repository = new MemoryTaskRepository();
    const action = new ActOnTask(
      new MemoryTransaction(repository),
      new MemoryIdentityDirectory(),
      () => '2026-08-30T10:00:00.000Z',
    );
    const detail = new GetTask(new MemoryTaskQuery([]));

    await expect(
      action.execute(ACTORS[0]!.id, 'missing', 'close', 1),
    ).rejects.toMatchObject({
      code: 'TASK_NOT_FOUND',
    });
    await expect(detail.execute('missing')).rejects.toMatchObject({
      code: 'TASK_NOT_FOUND',
    });
  });

  it('delegates list and detail reads to dedicated query projections', async () => {
    const model = { id: 'read-1' } as TaskReadModel;
    const query = new MemoryTaskQuery([model]);

    await expect(new ListTasks(query).execute()).resolves.toEqual([model]);
    await expect(new GetTask(query).execute('read-1')).resolves.toBe(model);
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
