/** Verifies raw task-event restoration and public timeline comment projection. */
import { describe, expect, it } from 'vitest';

import type { TaskOrmEntity } from './entities/task.orm-entity.js';
import {
  taskEntityToReadModel,
  taskEntityToSnapshot,
} from './task-orm-mapper.js';

/** Builds one complete ORM-shaped graph without depending on a database connection. */
function taskGraph(): TaskOrmEntity {
  const publisher = {
    id: 'noticeboard-master',
    username: 'noticeboard-master',
    name: '用户 A',
    roleId: 'role-user',
    roleEntity: { code: 'user', name: '用户' },
  };
  return {
    id: 'task-comments',
    title: '评论投影',
    type: 'exploration',
    description: '验证公开时间线',
    reward: '10 金币',
    dueDate: '2026-09-10',
    publisherId: publisher.id,
    publisher,
    assigneeId: null,
    assignee: null,
    status: 'in_progress',
    createdAt: new Date('2026-09-01T09:00:00.000Z'),
    updatedAt: new Date('2026-09-01T12:00:00.000Z'),
    version: 4,
    events: [
      {
        taskId: 'task-comments',
        sequence: 4,
        action: 'comment_deleted',
        actorId: 'noticeboard-admin',
        actorUsername: 'noticeboard-admin',
        actorName: '公会管理员',
        actorRole: 'system_admin',
        actorRoleName: '系统管理员',
        at: new Date('2026-09-01T12:00:00.000Z'),
        detail: '',
        commentId: null,
        content: null,
        targetCommentId: 'comment-1',
      },
      {
        taskId: 'task-comments',
        sequence: 2,
        action: 'comment_created',
        actorId: 'adventurer-a',
        actorUsername: 'adventurer-a',
        actorName: '用户 B',
        actorRole: 'user',
        actorRoleName: '用户',
        at: new Date('2026-09-01T10:00:00.000Z'),
        detail: '',
        commentId: 'comment-1',
        content: '数据库保留正文',
        targetCommentId: null,
      },
      {
        taskId: 'task-comments',
        sequence: 1,
        action: 'created',
        actorId: 'noticeboard-master',
        actorUsername: 'noticeboard-master',
        actorName: '用户 A',
        actorRole: 'user',
        actorRoleName: '用户',
        at: new Date('2026-09-01T09:00:00.000Z'),
        detail: '任务发布至冒险家工会',
        commentId: null,
        content: null,
        targetCommentId: null,
      },
      {
        taskId: 'task-comments',
        sequence: 3,
        action: 'accepted',
        actorId: 'adventurer-b',
        actorUsername: 'adventurer-b',
        actorName: '用户 C',
        actorRole: 'user',
        actorRoleName: '用户',
        at: new Date('2026-09-01T11:00:00.000Z'),
        detail: '开始执行任务',
        commentId: null,
        content: null,
        targetCommentId: null,
      },
    ],
  } as unknown as TaskOrmEntity;
}

describe('task ORM mapper', () => {
  /** Proves ORM rows restore the complete raw append-only event union. */
  it('restores raw comment events and actor usernames for aggregate persistence', () => {
    const snapshot = taskEntityToSnapshot(taskGraph());

    expect(snapshot.publisher.username).toBe('noticeboard-master');
    expect(snapshot.timeline).toEqual([
      expect.objectContaining({
        sequence: 1,
        action: 'created',
        actor: expect.objectContaining({ username: 'noticeboard-master' }),
      }),
      {
        sequence: 2,
        action: 'comment_created',
        commentId: 'comment-1',
        content: '数据库保留正文',
        actor: {
          id: 'adventurer-a',
          username: 'adventurer-a',
          name: '用户 B',
          role: 'user',
          roleLabel: '用户',
        },
        at: '2026-09-01T10:00:00.000Z',
      },
      expect.objectContaining({ sequence: 3, action: 'accepted' }),
      {
        sequence: 4,
        action: 'comment_deleted',
        targetCommentId: 'comment-1',
        actor: {
          id: 'noticeboard-admin',
          username: 'noticeboard-admin',
          name: '公会管理员',
          role: 'system_admin',
          roleLabel: '系统管理员',
        },
        at: '2026-09-01T12:00:00.000Z',
      },
    ]);
  });

  /** Proves public reads retain tombstones in place and hide raw delete markers. */
  it('keeps a deleted comment in its original position and hides the raw deletion event', () => {
    expect(taskEntityToReadModel(taskGraph()).timeline).toEqual([
      {
        kind: 'activity',
        sequence: 1,
        action: 'created',
        actor: {
          id: 'noticeboard-master',
          username: 'noticeboard-master',
          name: '用户 A',
          role: 'user',
          roleLabel: '用户',
        },
        at: '2026-09-01T09:00:00.000Z',
        detail: '任务发布至冒险家工会',
      },
      {
        kind: 'comment',
        sequence: 2,
        commentId: 'comment-1',
        actor: {
          id: 'adventurer-a',
          username: 'adventurer-a',
          name: '用户 B',
          role: 'user',
          roleLabel: '用户',
        },
        at: '2026-09-01T10:00:00.000Z',
        content: null,
        deleted: true,
        deletedAt: '2026-09-01T12:00:00.000Z',
        deletedByUsername: 'noticeboard-admin',
      },
      {
        kind: 'activity',
        sequence: 3,
        action: 'accepted',
        actor: {
          id: 'adventurer-b',
          username: 'adventurer-b',
          name: '用户 C',
          role: 'user',
          roleLabel: '用户',
        },
        at: '2026-09-01T11:00:00.000Z',
        detail: '开始执行任务',
      },
    ]);
  });
});
