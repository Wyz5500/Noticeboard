/** Calculates action-button visibility while the server remains the authoritative permission check. */
import type {
  PermissionCode,
  TaskAction,
  TaskResource,
} from '../core/api-types.js';

/** Returns the actions that appear for one current demo actor and task projection. */
export function availableActions(
  task: TaskResource,
  actorId: string,
  permissions?: readonly PermissionCode[],
): TaskAction[] {
  const actions: TaskAction[] = [];
  const allowed = (permission: PermissionCode): boolean =>
    !permissions || permissions.includes(permission);
  if (
    allowed('tasks.accept') &&
    ((task.status === 'not_started' && !task.assignee) ||
      task.status === 'reopened')
  )
    actions.push('accept');
  if (
    allowed('tasks.complete') &&
    task.status === 'in_progress' &&
    task.assignee?.id === actorId
  )
    actions.push('complete');
  if (
    allowed('tasks.review') &&
    task.status === 'completed' &&
    task.publisher.id === actorId
  )
    actions.push('approve', 'reopen');
  if (
    allowed('tasks.close') &&
    task.status === 'reopened' &&
    task.publisher.id === actorId
  )
    actions.push('close');
  return actions;
}
