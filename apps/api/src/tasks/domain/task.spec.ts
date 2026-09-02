/** Verifies the task aggregate's state machine, permissions, and immutable event history. */
import { describe, expect, it } from 'vitest';

import type { Actor } from '../../identity/public/actor.js';
import { DomainError } from './domain-error.js';
import { Task } from './task.js';
import type { TaskSnapshot } from './task.types.js';

const PUBLISHER: Actor = {
  id: 'noticeboard-master',
  username: 'noticeboard-master',
  name: '用户 A',
  role: 'user',
};
const ASSIGNEE: Actor = {
  id: 'adventurer-a',
  username: 'adventurer-a',
  name: '用户 B',
  role: 'user',
};
const REPLACEMENT: Actor = {
  id: 'adventurer-b',
  username: 'adventurer-b',
  name: '用户 C',
  role: 'user',
};
const CREATED_AT = '2026-08-29T12:00:00.000Z';

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
  task.act('accept', ASSIGNEE, '2026-08-29T13:00:00.000Z');
  task.act('complete', ASSIGNEE, '2026-08-29T14:00:00.000Z');
  return task;
}

describe('Task aggregate', () => {
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

  it('allows any known actor to accept an available task', () => {
    const task = createTask();

    task.act('accept', ASSIGNEE, '2026-08-29T13:00:00.000Z');

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
    task.act('accept', ASSIGNEE, '2026-08-29T13:00:00.000Z');

    expect(task.canAct('complete', ASSIGNEE)).toBe(true);
    expect(task.canAct('complete', REPLACEMENT)).toBe(false);
    expect(() =>
      task.act('complete', REPLACEMENT, '2026-08-29T14:00:00.000Z'),
    ).toThrowError(expect.objectContaining({ code: 'ACTION_FORBIDDEN' }));

    task.act('complete', ASSIGNEE, '2026-08-29T14:00:00.000Z');
    expect(task.toSnapshot()).toMatchObject({
      status: 'completed',
      version: 3,
    });
  });

  it('lets only the publisher approve and appends approval plus closing in order', () => {
    const task = completedTask();

    expect(task.canAct('approve', ASSIGNEE)).toBe(false);
    task.act('approve', PUBLISHER, '2026-08-29T15:00:00.000Z');

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

    task.act('reopen', PUBLISHER, '2026-08-29T15:00:00.000Z');
    expect(task.toSnapshot()).toMatchObject({
      status: 'reopened',
      assignee: ASSIGNEE,
      version: 4,
    });

    task.act('accept', REPLACEMENT, '2026-08-29T16:00:00.000Z');
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
    task.act('reopen', PUBLISHER, '2026-08-29T15:00:00.000Z');

    expect(task.canAct('close', PUBLISHER)).toBe(true);
    expect(task.canAct('close', ASSIGNEE)).toBe(false);
    task.act('close', PUBLISHER, '2026-08-29T16:00:00.000Z');
    expect(task.toSnapshot().status).toBe('closed');
  });

  /** Proves optimistic version checks avoid requiring a detached aggregate snapshot. */
  it('matches only the aggregate current version', () => {
    const task = createTask();

    expect(task.matchesVersion(1)).toBe(true);
    expect(task.matchesVersion(2)).toBe(false);
    task.addComment(
      'comment-version',
      '版本递增',
      ASSIGNEE,
      '2026-08-29T13:00:00.000Z',
    );
    expect(task.matchesVersion(1)).toBe(false);
    expect(task.matchesVersion(2)).toBe(true);
  });

  /** Proves normalized multiline content appends once without changing lifecycle ownership. */
  it('adds a trimmed multiline comment as an append-only event and increments version once', () => {
    const task = createTask();

    task.addComment(
      'comment-1',
      '  第一行\n第二行  ',
      REPLACEMENT,
      '2026-08-29T13:00:00.000Z',
    );

    expect(task.toSnapshot()).toMatchObject({
      status: 'not_started',
      updatedAt: '2026-08-29T13:00:00.000Z',
      version: 2,
    });
    expect(task.toSnapshot().timeline.at(-1)).toEqual({
      sequence: 2,
      action: 'comment_created',
      commentId: 'comment-1',
      content: '第一行\n第二行',
      actor: REPLACEMENT,
      at: '2026-08-29T13:00:00.000Z',
    });
    expect(task.latestActorId(new Set([PUBLISHER.id, REPLACEMENT.id]))).toBe(
      PUBLISHER.id,
    );
  });

  /** Proves normalized content must remain within the non-empty 1000-character contract. */
  it.each(['', '   ', 'x'.repeat(1001)])(
    'rejects empty or oversized comment content',
    (content) => {
      const task = createTask();

      expect(() =>
        task.addComment(
          'comment-invalid',
          content,
          ASSIGNEE,
          '2026-08-29T13:00:00.000Z',
        ),
      ).toThrowError(expect.objectContaining({ code: 'INVALID_COMMENT' }));
      expect(task.toSnapshot().version).toBe(1);
    },
  );

  /** Proves supplementary Unicode characters count as one public character each. */
  it('accepts 600 emoji within the 1000-character limit', () => {
    const task = createTask();

    expect(() =>
      task.addComment(
        'comment-emoji',
        '😀'.repeat(600),
        ASSIGNEE,
        '2026-08-29T13:00:00.000Z',
      ),
    ).not.toThrow();
  });

  /** Proves one thousand and one Unicode code points exceed the domain limit. */
  it('rejects 1001 Unicode code points', () => {
    const task = createTask();

    expect(() =>
      task.addComment(
        'comment-too-long',
        '😀'.repeat(1001),
        ASSIGNEE,
        '2026-08-29T13:00:00.000Z',
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_COMMENT' }));
  });

  /** Proves PostgreSQL-incompatible NUL characters are rejected at the domain boundary. */
  it('rejects comment content containing NUL', () => {
    const task = createTask();

    expect(() =>
      task.addComment(
        'comment-nul',
        '前缀\0后缀',
        ASSIGNEE,
        '2026-08-29T13:00:00.000Z',
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_COMMENT' }));
  });

  /** Proves closed tasks reject new comments without changing their version. */
  it('rejects new comments after the task is closed', () => {
    const task = completedTask();
    task.act('approve', PUBLISHER, '2026-08-29T15:00:00.000Z');

    expect(() =>
      task.addComment(
        'comment-closed',
        '不能新增',
        ASSIGNEE,
        '2026-08-29T16:00:00.000Z',
      ),
    ).toThrowError(expect.objectContaining({ code: 'COMMENT_CONFLICT' }));
  });

  /** Proves author deletion appends a marker while preserving raw created content. */
  it('lets the author delete a comment while retaining its original content in raw history', () => {
    const task = createTask();
    task.addComment(
      'comment-1',
      '保留原始正文',
      ASSIGNEE,
      '2026-08-29T13:00:00.000Z',
    );

    task.deleteComment(
      'comment-1',
      ASSIGNEE,
      false,
      '2026-08-29T14:00:00.000Z',
    );

    expect(task.toSnapshot()).toMatchObject({
      updatedAt: '2026-08-29T14:00:00.000Z',
      version: 3,
    });
    expect(task.toSnapshot().timeline.slice(-2)).toEqual([
      {
        sequence: 2,
        action: 'comment_created',
        commentId: 'comment-1',
        content: '保留原始正文',
        actor: ASSIGNEE,
        at: '2026-08-29T13:00:00.000Z',
      },
      {
        sequence: 3,
        action: 'comment_deleted',
        targetCommentId: 'comment-1',
        actor: ASSIGNEE,
        at: '2026-08-29T14:00:00.000Z',
      },
    ]);
  });

  /** Proves live management authority may delete existing comments on closed tasks. */
  it('lets a manager delete an existing comment after the task is closed', () => {
    const task = completedTask();
    task.addComment(
      'comment-1',
      '关闭前评论',
      ASSIGNEE,
      '2026-08-29T14:30:00.000Z',
    );
    task.act('approve', PUBLISHER, '2026-08-29T15:00:00.000Z');

    expect(() =>
      task.deleteComment(
        'comment-1',
        REPLACEMENT,
        true,
        '2026-08-29T16:00:00.000Z',
      ),
    ).not.toThrow();
  });

  /** Proves deletion distinguishes absent, unauthorized, and already-deleted comments. */
  it('rejects missing, unauthorized, and repeated comment deletion', () => {
    const task = createTask();
    task.addComment(
      'comment-1',
      '待删除',
      ASSIGNEE,
      '2026-08-29T13:00:00.000Z',
    );

    expect(() =>
      task.deleteComment(
        'missing',
        ASSIGNEE,
        false,
        '2026-08-29T14:00:00.000Z',
      ),
    ).toThrowError(expect.objectContaining({ code: 'COMMENT_NOT_FOUND' }));
    expect(() =>
      task.deleteComment(
        'comment-1',
        REPLACEMENT,
        false,
        '2026-08-29T14:00:00.000Z',
      ),
    ).toThrowError(expect.objectContaining({ code: 'COMMENT_FORBIDDEN' }));

    task.deleteComment(
      'comment-1',
      ASSIGNEE,
      false,
      '2026-08-29T14:00:00.000Z',
    );
    expect(() =>
      task.deleteComment(
        'comment-1',
        ASSIGNEE,
        false,
        '2026-08-29T15:00:00.000Z',
      ),
    ).toThrowError(expect.objectContaining({ code: 'COMMENT_CONFLICT' }));
  });

  /** Proves comment actors never replace the latest recognized lifecycle actor. */
  it('assigns mine scope to the last lifecycle actor that still exists', () => {
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
          action: 'comment_created',
          actor: REPLACEMENT,
          at: '2026-08-29T13:30:00.000Z',
          commentId: 'comment-ignored',
          content: '评论不影响 mine',
        },
        {
          sequence: 4,
          action: 'reopened',
          actor: {
            id: 'removed-user',
            username: 'removed-user',
            name: '旧成员',
            role: 'user',
          },
          at: '2026-08-29T14:00:00.000Z',
          detail: '历史事件',
        },
      ],
    };

    expect(
      Task.restore(persisted).latestActorId(
        new Set([PUBLISHER.id, ASSIGNEE.id, REPLACEMENT.id]),
      ),
    ).toBe(ASSIGNEE.id);
  });
});
