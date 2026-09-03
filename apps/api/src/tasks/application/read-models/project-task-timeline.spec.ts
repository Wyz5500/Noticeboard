/** Verifies raw append-only task events fold into the safe public timeline. */
import { describe, expect, it } from 'vitest';

import type { Actor } from '../../../identity/public/actor.js';
import type { TaskEvent } from '../../domain/task.types.js';
import { projectTaskTimeline } from './project-task-timeline.js';

const AUTHOR: Actor = {
  id: 'author',
  username: 'author',
  name: '作者',
  role: 'user',
};
const DELETER: Actor = {
  id: 'manager',
  username: 'manager',
  name: '管理员',
  role: 'system_admin',
};

/** Builds deliberately unordered raw markers to pressure the complete fold. */
function unorderedEvents(): TaskEvent[] {
  return [
    {
      sequence: 1,
      action: 'comment_deleted',
      targetCommentId: 'comment-late',
      actor: DELETER,
      at: '2026-09-01T11:00:00.000Z',
    },
    {
      sequence: 2,
      action: 'comment_created',
      commentId: 'comment-late',
      content: '不得泄漏的正文',
      actor: AUTHOR,
      at: '2026-09-01T10:00:00.000Z',
    },
    {
      sequence: 3,
      action: 'comment_deleted',
      targetCommentId: 'orphan',
      actor: DELETER,
      at: '2026-09-01T12:00:00.000Z',
    },
  ];
}

describe('projectTaskTimeline', () => {
  /** Proves deletion markers tombstone matching comments regardless of raw marker order. */
  it('collects every deletion marker before projecting comment creation', () => {
    expect(projectTaskTimeline(unorderedEvents())).toEqual([
      {
        kind: 'comment',
        sequence: 2,
        commentId: 'comment-late',
        actor: AUTHOR,
        at: '2026-09-01T10:00:00.000Z',
        content: null,
        edited: false,
        deleted: true,
        deletedAt: '2026-09-01T11:00:00.000Z',
        deletedByUsername: 'manager',
      },
    ]);
  });

  /** Proves the latest sequenced edit replaces public content without moving the comment. */
  it('folds all edits into one comment with an edited marker', () => {
    const events: TaskEvent[] = [
      {
        sequence: 4,
        action: 'comment_edited',
        targetCommentId: 'comment-1',
        content: '第三版',
        actor: AUTHOR,
        at: '2026-09-01T12:00:00.000Z',
      },
      {
        sequence: 2,
        action: 'comment_created',
        commentId: 'comment-1',
        content: '第一版',
        actor: AUTHOR,
        at: '2026-09-01T10:00:00.000Z',
      },
      {
        sequence: 3,
        action: 'comment_edited',
        targetCommentId: 'comment-1',
        content: '第二版',
        actor: AUTHOR,
        at: '2026-09-01T11:00:00.000Z',
      },
    ];

    expect(projectTaskTimeline(events)).toEqual([
      {
        kind: 'comment',
        sequence: 2,
        commentId: 'comment-1',
        actor: AUTHOR,
        at: '2026-09-01T10:00:00.000Z',
        content: '第三版',
        edited: true,
        deleted: false,
        deletedAt: null,
        deletedByUsername: null,
      },
    ]);
  });

  /** Proves deleting an edited comment hides every historical body and raw marker. */
  it('gives deletion priority over edited content', () => {
    const events: TaskEvent[] = [
      {
        sequence: 2,
        action: 'comment_created',
        commentId: 'comment-1',
        content: '原始秘密',
        actor: AUTHOR,
        at: '2026-09-01T10:00:00.000Z',
      },
      {
        sequence: 3,
        action: 'comment_edited',
        targetCommentId: 'comment-1',
        content: '编辑秘密',
        actor: AUTHOR,
        at: '2026-09-01T11:00:00.000Z',
      },
      {
        sequence: 4,
        action: 'comment_deleted',
        targetCommentId: 'comment-1',
        actor: DELETER,
        at: '2026-09-01T12:00:00.000Z',
      },
    ];

    expect(projectTaskTimeline(events)).toEqual([
      {
        kind: 'comment',
        sequence: 2,
        commentId: 'comment-1',
        actor: AUTHOR,
        at: '2026-09-01T10:00:00.000Z',
        content: null,
        edited: false,
        deleted: true,
        deletedAt: '2026-09-01T12:00:00.000Z',
        deletedByUsername: 'manager',
      },
    ]);
  });
});
