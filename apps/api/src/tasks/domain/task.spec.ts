/** Verifies the task aggregate's state machine, permissions, and immutable event history. */
import { describe, expect, it } from 'vitest';

import type { Actor } from '../../identity/public/actor.js';
import { DomainError } from './domain-error.js';
import { deriveTaskEffectiveStatus, Task } from './task.js';
import type {
  TaskEffectiveStatus,
  TaskSnapshot,
  TaskStatus,
} from './task.types.js';

const PUBLISHER: Actor = {
  id: 'noticeboard-master',
  name: '用户 A',
  role: 'user',
};
const ASSIGNEE: Actor = { id: 'adventurer-a', name: '用户 B', role: 'user' };
const REPLACEMENT: Actor = { id: 'adventurer-b', name: '用户 C', role: 'user' };
const CREATED_AT = '2026-08-29T12:00:00.000Z';
const CURRENT_DATE = '2026-08-29';

/** Creates one deterministic task so assertions remain independent from clocks and IDs. */
function createTask(): Task {
  return Task.create(
    {
      id: 'task-test',
      title: '  测试委托  ',
      type: 'exploration',
      description: '  绘制安全路线  ',
      reward: '  20 金币  ',
      dueDate: '2026-09-01',
    },
    PUBLISHER,
    CREATED_AT,
  );
}

/** Drives a task through acceptance and completion for publisher review tests. */
function completedTask(): Task {
  const task = createTask();
  task.act('accept', ASSIGNEE, '2026-08-29T13:00:00.000Z', CURRENT_DATE);
  task.act('complete', ASSIGNEE, '2026-08-29T14:00:00.000Z', CURRENT_DATE);
  return task;
}

describe('Task aggregate', () => {
  it.each<[TaskStatus, string, string, TaskEffectiveStatus]>([
    ['in_progress', '2026-09-01', '2026-09-02', 'expired'],
    ['completed', '2026-09-01', '2026-09-01', 'completed'],
    ['closed', '2026-09-01', '2026-09-02', 'closed'],
  ])(
    'derives %s with due date %s on business date %s as %s',
    (status, dueDate, currentDate, expected) => {
      expect(deriveTaskEffectiveStatus(status, dueDate, currentDate)).toBe(
        expected,
      );
    },
  );

  it('creates a trimmed not-started task and records the publisher', () => {
    const snapshot = createTask().toSnapshot();

    expect(snapshot).toMatchObject({
      id: 'task-test',
      title: '测试委托',
      type: 'exploration',
      description: '绘制安全路线',
      reward: '20 金币',
      dueDate: '2026-09-01',
      status: 'not_started',
      publisher: PUBLISHER,
      assignee: null,
      version: 1,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    expect(snapshot.timeline).toEqual([
      {
        sequence: 1,
        action: 'created',
        actor: PUBLISHER,
        at: CREATED_AT,
        detail: '任务发布至冒险家工会',
      },
    ]);
  });

  it.each([
    ['', 'description', 'reward', '2026-09-01'],
    ['title', '', 'reward', '2026-09-01'],
    ['title', 'description', '', '2026-09-01'],
    ['title', 'description', 'reward', 'not-a-date'],
  ])(
    'rejects incomplete or malformed creation input',
    (title, description, reward, dueDate) => {
      expect(() =>
        Task.create(
          {
            id: 'task-invalid',
            title,
            type: 'exploration',
            description,
            reward,
            dueDate,
          },
          PUBLISHER,
          CREATED_AT,
        ),
      ).toThrowError(DomainError);
    },
  );

  it('rejects ordinary actions after an open task expires without mutating it', () => {
    const task = createTask();
    const before = task.toSnapshot();

    expect(task.canAct('accept', ASSIGNEE, '2026-09-02')).toBe(false);
    expect(() =>
      task.act('accept', ASSIGNEE, '2026-08-29T13:00:00.000Z', '2026-09-02'),
    ).toThrowError(expect.objectContaining({ code: 'TASK_EXPIRED' }));
    expect(task.toSnapshot()).toEqual(before);
  });

  it('lets the publisher renew an expired task while preserving its workflow state', () => {
    const task = createTask();
    task.act('accept', ASSIGNEE, '2026-08-29T13:00:00.000Z', CURRENT_DATE);
    task.renewExpired(PUBLISHER, {
      dueDate: '2026-09-03',
      recoveryStrategy: 'preserve_status',
      currentDate: '2026-09-02',
      at: '2026-09-02T04:00:00.000Z',
    });

    expect(task.toSnapshot()).toMatchObject({
      dueDate: '2026-09-03',
      status: 'in_progress',
      assignee: ASSIGNEE,
      updatedAt: '2026-09-02T04:00:00.000Z',
      version: 3,
    });
    expect(task.toSnapshot().timeline.at(-1)).toEqual({
      sequence: 3,
      action: 'renewed',
      actor: PUBLISHER,
      at: '2026-09-02T04:00:00.000Z',
      detail:
        '截止日期由 2026-09-01 调整为 2026-09-03；保留工作流状态：进行中；接取者保持不变',
    });
  });

  it('clears the assignee when an expired task is renewed as reopened', () => {
    const task = completedTask();

    task.renewExpired(PUBLISHER, {
      dueDate: '2026-09-03',
      recoveryStrategy: 'reopened',
      currentDate: '2026-09-02',
      at: '2026-09-02T04:00:00.000Z',
    });

    expect(task.toSnapshot()).toMatchObject({
      dueDate: '2026-09-03',
      status: 'reopened',
      assignee: null,
      version: 4,
    });
    expect(task.toSnapshot().timeline.at(-1)).toMatchObject({
      action: 'renewed',
      detail:
        '截止日期由 2026-09-01 调整为 2026-09-03；工作流状态改为：重新打开；接取者已清空',
    });
  });

  it('rejects renewal by an actor other than the publisher', () => {
    const task = createTask();
    const before = task.toSnapshot();

    expect(() =>
      task.renewExpired(ASSIGNEE, {
        dueDate: '2026-09-03',
        recoveryStrategy: 'preserve_status',
        currentDate: '2026-09-02',
        at: '2026-09-02T04:00:00.000Z',
      }),
    ).toThrowError(expect.objectContaining({ code: 'ACTION_FORBIDDEN' }));
    expect(task.toSnapshot()).toEqual(before);
  });

  it('rejects renewal while a task is still active', () => {
    const task = createTask();
    const before = task.toSnapshot();

    expect(() =>
      task.renewExpired(PUBLISHER, {
        dueDate: '2026-09-03',
        recoveryStrategy: 'preserve_status',
        currentDate: '2026-09-01',
        at: '2026-09-01T04:00:00.000Z',
      }),
    ).toThrowError(expect.objectContaining({ code: 'TASK_NOT_EXPIRED' }));
    expect(task.toSnapshot()).toEqual(before);
  });

  it.each(['2026-09-02', 'not-a-date'])(
    'rejects invalid renewal due date %s',
    (dueDate) => {
      const task = createTask();
      const before = task.toSnapshot();

      expect(() =>
        task.renewExpired(PUBLISHER, {
          dueDate,
          recoveryStrategy: 'preserve_status',
          currentDate: '2026-09-02',
          at: '2026-09-02T04:00:00.000Z',
        }),
      ).toThrowError(expect.objectContaining({ code: 'INVALID_TASK' }));
      expect(task.toSnapshot()).toEqual(before);
    },
  );

  it('allows any known actor to accept an available task', () => {
    const task = createTask();

    task.act('accept', ASSIGNEE, '2026-08-29T13:00:00.000Z', CURRENT_DATE);

    expect(task.toSnapshot()).toMatchObject({
      assignee: ASSIGNEE,
      status: 'in_progress',
      updatedAt: '2026-08-29T13:00:00.000Z',
      version: 2,
    });
    expect(task.toSnapshot().timeline[1]).toMatchObject({
      sequence: 2,
      action: 'accepted',
      actor: ASSIGNEE,
      detail: '开始执行任务',
    });
  });

  it('allows only the current assignee to complete an in-progress task', () => {
    const task = createTask();
    task.act('accept', ASSIGNEE, '2026-08-29T13:00:00.000Z', CURRENT_DATE);

    expect(task.canAct('complete', ASSIGNEE, CURRENT_DATE)).toBe(true);
    expect(task.canAct('complete', REPLACEMENT, CURRENT_DATE)).toBe(false);
    expect(() =>
      task.act(
        'complete',
        REPLACEMENT,
        '2026-08-29T14:00:00.000Z',
        CURRENT_DATE,
      ),
    ).toThrowError(expect.objectContaining({ code: 'ACTION_FORBIDDEN' }));

    task.act('complete', ASSIGNEE, '2026-08-29T14:00:00.000Z', CURRENT_DATE);
    expect(task.toSnapshot()).toMatchObject({
      status: 'completed',
      version: 3,
    });
  });

  it('lets only the publisher approve and appends approval plus closing in order', () => {
    const task = completedTask();

    expect(task.canAct('approve', ASSIGNEE, CURRENT_DATE)).toBe(false);
    task.act('approve', PUBLISHER, '2026-08-29T15:00:00.000Z', CURRENT_DATE);

    const snapshot = task.toSnapshot();
    expect(snapshot.status).toBe('closed');
    expect(snapshot.version).toBe(4);
    expect(snapshot.timeline.slice(-2)).toEqual([
      {
        sequence: 4,
        action: 'approved',
        actor: PUBLISHER,
        at: '2026-08-29T15:00:00.000Z',
        detail: '任务成果符合要求',
      },
      {
        sequence: 5,
        action: 'closed',
        actor: PUBLISHER,
        at: '2026-08-29T15:00:00.000Z',
        detail: '任务流程结束',
      },
    ]);
  });

  it('keeps the old assignee on reopen and permits a replacement acceptance', () => {
    const task = completedTask();

    task.act('reopen', PUBLISHER, '2026-08-29T15:00:00.000Z', CURRENT_DATE);
    expect(task.toSnapshot()).toMatchObject({
      status: 'reopened',
      assignee: ASSIGNEE,
      version: 4,
    });

    task.act('accept', REPLACEMENT, '2026-08-29T16:00:00.000Z', CURRENT_DATE);
    expect(task.toSnapshot()).toMatchObject({
      status: 'in_progress',
      assignee: REPLACEMENT,
      version: 5,
    });
    expect(task.toSnapshot().timeline.at(-1)).toMatchObject({
      action: 'accepted',
      detail: '重新开始执行任务',
    });
  });

  it('allows the publisher to close a reopened task directly', () => {
    const task = completedTask();
    task.act('reopen', PUBLISHER, '2026-08-29T15:00:00.000Z', CURRENT_DATE);

    expect(task.canAct('close', PUBLISHER, CURRENT_DATE)).toBe(true);
    expect(task.canAct('close', ASSIGNEE, CURRENT_DATE)).toBe(false);
    task.act('close', PUBLISHER, '2026-08-29T16:00:00.000Z', CURRENT_DATE);
    expect(task.toSnapshot().status).toBe('closed');
  });

  it('assigns mine scope to the last event actor that still exists', () => {
    const task = createTask();
    const persisted: TaskSnapshot = {
      ...task.toSnapshot(),
      timeline: [
        ...task.toSnapshot().timeline,
        {
          sequence: 2,
          action: 'accepted',
          actor: ASSIGNEE,
          at: '2026-08-29T13:00:00.000Z',
          detail: '开始执行任务',
        },
        {
          sequence: 3,
          action: 'reopened',
          actor: { id: 'removed-user', name: '旧成员', role: 'user' },
          at: '2026-08-29T14:00:00.000Z',
          detail: '历史事件',
        },
      ],
    };

    expect(
      Task.restore(persisted).latestActorId(
        new Set([PUBLISHER.id, ASSIGNEE.id]),
      ),
    ).toBe(ASSIGNEE.id);
  });
});
