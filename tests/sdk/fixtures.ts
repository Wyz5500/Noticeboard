/** Complete wire fixtures for SDK contracts, independent of server and generated implementations. */
export const identity = {
  id: 'user-1',
  name: '演示成员',
  username: 'demo',
  role: 'member',
  roleLabel: '成员',
  permissions: ['tasks.view'],
};

export const activity = {
  kind: 'activity',
  action: 'accepted',
  actionLabel: '接取',
  actor: identity,
  at: '2026-09-01T00:00:00.000Z',
  detail: '接取任务',
  sequence: 1,
};

export const comment = {
  kind: 'comment',
  actor: identity,
  at: '2026-09-01T00:01:00.000Z',
  commentId: 'comment-1',
  content: '编辑后的正文',
  deleted: false,
  deletedAt: null,
  deletedByUsername: null,
  edited: true,
  sequence: 2,
};

export const tombstone = {
  ...comment,
  commentId: 'comment-2',
  content: null,
  deleted: true,
  deletedAt: '2026-09-01T00:02:00.000Z',
  deletedByUsername: 'demo',
  sequence: 3,
};

export const task = {
  id: 'task-1',
  title: '只读客户端',
  description: '完整合同',
  type: 'exploration',
  typeLabel: '探索',
  dueDate: '2026-09-02',
  assignee: null,
  publisher: identity,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:02:00.000Z',
  status: 'in_progress',
  statusLabel: '进行中',
  workflowStatus: 'in_progress',
  workflowStatusLabel: '进行中',
  version: 4,
  timeline: [activity, comment, tombstone],
  reward: '测试奖励',
};

export const apiError = {
  error: {
    code: 'FUTURE_ERROR',
    message: '安全错误消息',
    details: { version: 4 },
  },
  path: '/api/v1/tasks/task-1',
  timestamp: '2026-09-01T00:00:00.000Z',
};
