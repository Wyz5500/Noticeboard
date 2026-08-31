/** Verifies task action visibility respects the same permissions as the API. */
import { describe, expect, it } from 'vitest';

import type { TaskResource } from '../core/api-types.js';
import { availableActions } from './task-permissions.js';

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
