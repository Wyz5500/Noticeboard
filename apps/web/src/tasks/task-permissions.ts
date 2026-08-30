/** Calculates action-button visibility while the server remains the authoritative permission check. */
import type { TaskAction, TaskResource } from '../core/api-types.js';

/** Returns the actions that appear for one current demo actor and task projection. */
export function availableActions(
  task: TaskResource,
  actorId: string,
): TaskAction[] {
  const actions: TaskAction[] = [];
  if (
    (task.status === 'not_started' && !task.assignee) ||
    task.status === 'reopened'
  )
    actions.push('accept');
  if (task.status === 'in_progress' && task.assignee?.id === actorId)
    actions.push('complete');
  if (task.status === 'completed' && task.publisher.id === actorId)
    actions.push('approve', 'reopen');
  if (task.status === 'reopened' && task.publisher.id === actorId)
    actions.push('close');
  return actions;
}
