/** Verifies task action visibility respects the same permissions as the API. */
import { describe, expect, it } from 'vitest';

import type { TaskResource } from '../core/api-types.js';
import * as taskPermissions from './task-permissions.js';

const { availableActions } = taskPermissions;

const REOPENED_TASK: TaskResource = {
  id: 'task-reopened',
  title: '重新打开的任务',
  type: 'exploration',
  typeLabel: '探索',
  description: '权限回归测试',
  reward: '10 金币',
  dueDate: '2026-09-10',
  publisher: {
    id: 'noticeboard-master',
    name: '用户 A',
    role: 'user',
    roleLabel: '用户',
  },
  assignee: null,
  workflowStatus: 'reopened',
  workflowStatusLabel: '重新打开',
  status: 'reopened',
  statusLabel: '重新打开',
  createdAt: '2026-08-30T09:00:00.000Z',
  updatedAt: '2026-08-30T09:00:00.000Z',
  version: 2,
  timeline: [],
};

describe('task action permissions', () => {
  /** Ensures reopened tasks do not expose an action the server will reject. */
  it('hides re-accept for roles without tasks.accept', () => {
    expect(
      availableActions(REOPENED_TASK, 'adventurer-a', ['tasks.view']),
    ).not.toContain('accept');
  });

  /** Ensures only the publisher with review permission can renew an expired task. */
  it('shows expired-task renewal only to the authorized publisher', () => {
    const expiredTask = {
      ...REOPENED_TASK,
      status: 'expired',
      statusLabel: '已失效',
    } as TaskResource;
    const canRenewExpiredTask = (taskPermissions as Record<string, unknown>)[
      'canRenewExpiredTask'
    ] as
      | ((
          task: TaskResource,
          actorId: string,
          permissions?: readonly string[],
        ) => boolean)
      | undefined;

    expect(
      canRenewExpiredTask?.(expiredTask, 'noticeboard-master', [
        'tasks.view',
        'tasks.review',
      ]) ?? false,
    ).toBe(true);
    expect(
      canRenewExpiredTask?.(expiredTask, 'adventurer-a', [
        'tasks.view',
        'tasks.review',
      ]) ?? false,
    ).toBe(false);
  });

  /** Ensures reopened tasks remain actionable when the role has accept permission. */
  it('shows re-accept for roles with tasks.accept', () => {
    expect(
      availableActions(REOPENED_TASK, 'adventurer-a', [
        'tasks.view',
        'tasks.accept',
      ]),
    ).toContain('accept');
  });
});
