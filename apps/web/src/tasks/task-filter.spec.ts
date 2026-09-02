/** Verifies client-side scope, status, search, and overview calculations over API projections. */
import { describe, expect, it } from 'vitest';

import type { TaskResource } from '../core/api-types.js';
import { filterTasks, latestKnownActorId, taskCounts } from './task-filter.js';

/** Creates a complete API task resource with caller-supplied ownership and status differences. */
function task(overrides: Partial<TaskResource> = {}): TaskResource {
  return {
    id: 'task-filter',
    title: '修复旧矿井的照明符文',
    type: 'building',
    typeLabel: '建造',
    description: '确保矿工夜间通行安全',
    reward: '25 金币',
    dueDate: '2026-09-10',
    publisher: {
      id: 'noticeboard-master',
      username: 'user-a',
      name: '用户 A',
      role: 'user',
      roleLabel: '演示用户',
    },
    assignee: {
      id: 'adventurer-a',
      username: 'user-b',
      name: '用户 B',
      role: 'user',
      roleLabel: '演示用户',
    },
    workflowStatus: 'in_progress',
    workflowStatusLabel: '进行中',
    status: 'in_progress',
    statusLabel: '进行中',
    createdAt: '2026-08-30T09:00:00.000Z',
    updatedAt: '2026-08-30T10:00:00.000Z',
    version: 2,
    timeline: [
      {
        kind: 'activity',
        sequence: 1,
        action: 'created',
        actionLabel: '创建任务',
        actor: {
          id: 'noticeboard-master',
          username: 'user-a',
          name: '用户 A',
          role: 'user',
          roleLabel: '演示用户',
        },
        at: '2026-08-30T09:00:00.000Z',
        detail: '任务发布至冒险家工会',
      },
      {
        kind: 'activity',
        sequence: 2,
        action: 'accepted',
        actionLabel: '接取任务',
        actor: {
          id: 'adventurer-a',
          username: 'user-b',
          name: '用户 B',
          role: 'user',
          roleLabel: '演示用户',
        },
        at: '2026-08-30T10:00:00.000Z',
        detail: '开始执行任务',
      },
    ],
    ...overrides,
  };
}

describe('task filtering', () => {
  /** Proves mine scope follows the newest still-valid timeline actor rather than assignee. */
  it('uses the last valid timeline actor for mine scope', () => {
    const withRemovedLatestActor = task({
      timeline: [
        ...task().timeline,
        {
          kind: 'activity',
          sequence: 3,
          action: 'reopened',
          actionLabel: '重新打开',
          actor: {
            id: 'removed-user',
            username: 'removed-user',
            name: '旧成员',
            role: 'user',
            roleLabel: '演示用户',
          },
          at: '2026-08-30T11:00:00.000Z',
          detail: '历史事件',
        },
      ],
    });

    expect(
      latestKnownActorId(
        withRemovedLatestActor,
        new Set(['noticeboard-master', 'adventurer-a']),
      ),
    ).toBe('adventurer-a');
    expect(
      filterTasks([withRemovedLatestActor], {
        scope: 'mine',
        filter: '全部',
        query: '',
        currentUserId: 'adventurer-a',
        knownUserIds: new Set(['noticeboard-master', 'adventurer-a']),
      }),
    ).toHaveLength(1);
  });

  /** Proves comments never transfer mine-scope ownership away from the latest activity actor. */
  it('ignores comment actors when resolving mine scope', () => {
    const withNewerComment = task({
      timeline: [
        ...task().timeline,
        {
          kind: 'comment',
          sequence: 3,
          commentId: 'comment-3',
          actor: {
            id: 'noticeboard-master',
            username: 'user-a',
            name: '用户 A',
            role: 'user',
            roleLabel: '演示用户',
          },
          at: '2026-08-30T11:00:00.000Z',
          content: '请补充进度',
          deleted: false,
          deletedAt: null,
          deletedByUsername: null,
        },
      ],
    });

    expect(
      latestKnownActorId(
        withNewerComment,
        new Set(['noticeboard-master', 'adventurer-a']),
      ),
    ).toBe('adventurer-a');
  });

  /** Proves the preserved Chinese filter labels map to stable API status codes. */
  it('filters by status label without changing the URL vocabulary', () => {
    expect(
      filterTasks([task()], {
        scope: 'all',
        filter: '已完成',
        query: '',
        currentUserId: 'noticeboard-master',
        knownUserIds: new Set(['noticeboard-master', 'adventurer-a']),
      }),
    ).toEqual([]);
  });

  /** Proves search includes the same task and actor text fields as the old interface. */
  it.each(['矿井', '建造', '夜间', '用户 A', '用户 B'])(
    'searches visible task and actor text for %s',
    (query) => {
      expect(
        filterTasks([task()], {
          scope: 'all',
          filter: '全部',
          query,
          currentUserId: 'noticeboard-master',
          knownUserIds: new Set(['noticeboard-master', 'adventurer-a']),
        }),
      ).toHaveLength(1);
    },
  );

  /** Proves timeline comment bodies never expand the task-board search corpus. */
  it('does not search comment content', () => {
    const commented = task({
      timeline: [
        ...task().timeline,
        {
          kind: 'comment',
          sequence: 3,
          commentId: 'comment-search',
          actor: {
            id: 'noticeboard-master',
            username: 'user-a',
            name: '用户 A',
            role: 'user',
            roleLabel: '演示用户',
          },
          at: '2026-08-30T11:00:00.000Z',
          content: '只存在于评论的霜狼暗号',
          deleted: false,
          deletedAt: null,
          deletedByUsername: null,
        },
      ],
    });

    expect(
      filterTasks([commented], {
        scope: 'all',
        filter: '全部',
        query: '霜狼暗号',
        currentUserId: 'noticeboard-master',
        knownUserIds: new Set(['noticeboard-master', 'adventurer-a']),
      }),
    ).toEqual([]);
  });

  /** Proves overview statistics expose the complete task-board status set. */
  it('counts every task-board status', () => {
    const tasks = [
      task(),
      task({
        id: 'task-not-started',
        status: 'not_started',
        statusLabel: '未开始',
      }),
      task({
        id: 'task-completed',
        status: 'completed',
        statusLabel: '已完成',
      }),
      task({
        id: 'task-reopened',
        status: 'reopened',
        statusLabel: '重新打开',
      }),
      task({ id: 'task-expired', status: 'expired', statusLabel: '已失效' }),
      task({ id: 'task-closed', status: 'closed', statusLabel: '关闭' }),
    ];

    expect(taskCounts(tasks)).toEqual({
      total: 6,
      notStarted: 1,
      inProgress: 1,
      completed: 1,
      reopened: 1,
      expired: 1,
      closed: 1,
    });
  });
});
