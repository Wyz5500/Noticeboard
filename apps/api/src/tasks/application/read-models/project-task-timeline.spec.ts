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
        deleted: true,
        deletedAt: '2026-09-01T11:00:00.000Z',
        deletedByUsername: 'manager',
      },
    ]);
  });
});
