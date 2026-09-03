/** Folds raw task events into public activities and comment tombstones. */
import type { TaskEvent } from '../../domain/task.types.js';
import type {
  TaskCommentReadModel,
  TaskTimelineReadModel,
} from './task-read-model.js';

/** Projects raw events after collecting every deletion marker to prevent content leakage. */
export function projectTaskTimeline(
  events: readonly TaskEvent[],
): TaskTimelineReadModel[] {
  const deletions = new Map<
    string,
    Extract<TaskEvent, { action: 'comment_deleted' }>
  >();
  const edits = new Map<
    string,
    Extract<TaskEvent, { action: 'comment_edited' }>
  >();
  for (const event of events) {
    if (event.action === 'comment_deleted') {
      const current = deletions.get(event.targetCommentId);
      if (!current || event.sequence > current.sequence) {
        deletions.set(event.targetCommentId, event);
      }
    } else if (event.action === 'comment_edited') {
      const current = edits.get(event.targetCommentId);
      if (!current || event.sequence > current.sequence) {
        edits.set(event.targetCommentId, event);
      }
    }
  }

  const timeline: TaskTimelineReadModel[] = [];
  for (const event of events) {
    if (event.action === 'comment_created') {
      const edit = edits.get(event.commentId);
      const deletion = deletions.get(event.commentId);
      const comment: TaskCommentReadModel = {
        kind: 'comment',
        sequence: event.sequence,
        commentId: event.commentId,
        actor: event.actor,
        at: event.at,
        content: deletion ? null : (edit?.content ?? event.content),
        edited: !deletion && Boolean(edit),
        deleted: Boolean(deletion),
        deletedAt: deletion?.at ?? null,
        deletedByUsername: deletion?.actor.username ?? null,
      };
      timeline.push(comment);
    } else if (
      event.action !== 'comment_edited' &&
      event.action !== 'comment_deleted'
    ) {
      timeline.push({
        kind: 'activity',
        sequence: event.sequence,
        action: event.action,
        actor: event.actor,
        at: event.at,
        detail: event.detail,
      });
    }
  }
  return timeline;
}
