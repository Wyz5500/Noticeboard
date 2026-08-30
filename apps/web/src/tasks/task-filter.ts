/** Performs task scope, status, search, and statistics calculations entirely in browser memory. */
import type { TaskResource, TaskStatus } from '../core/api-types.js';
import type { FilterLabel, TaskScope } from '../core/router.js';

const STATUS_BY_LABEL: Record<Exclude<FilterLabel, '全部'>, TaskStatus> = {
  未开始: 'not_started',
  进行中: 'in_progress',
  已完成: 'completed',
  重新打开: 'reopened',
  关闭: 'closed',
};

export interface TaskFilter {
  scope: TaskScope;
  filter: FilterLabel;
  query: string;
  currentUserId: string;
  knownUserIds: ReadonlySet<string>;
}

/** Finds the newest event actor still present in the current demo identity directory. */
export function latestKnownActorId(
  task: TaskResource,
  knownUserIds: ReadonlySet<string>,
): string | null {
  for (let index = task.timeline.length - 1; index >= 0; index -= 1) {
    const event = task.timeline[index];
    if (event && knownUserIds.has(event.actor.id)) return event.actor.id;
  }
  return null;
}

/** Filters the already-loaded task collection without causing API loading flicker. */
export function filterTasks(
  tasks: TaskResource[],
  filter: TaskFilter,
): TaskResource[] {
  const term = filter.query.trim().toLocaleLowerCase('zh-CN');
  return tasks.filter((task) => {
    const matchesScope =
      filter.scope === 'all' ||
      latestKnownActorId(task, filter.knownUserIds) === filter.currentUserId;
    const matchesStatus =
      filter.filter === '全部' ||
      task.status === STATUS_BY_LABEL[filter.filter];
    const searchable = [
      task.title,
      task.typeLabel,
      task.description,
      task.publisher.name,
      task.assignee?.name ?? '',
    ]
      .join(' ')
      .toLocaleLowerCase('zh-CN');
    return (
      matchesScope && matchesStatus && (!term || searchable.includes(term))
    );
  });
}

/** Calculates home statistics from tasks whose newest valid actor is the current user. */
export function taskCounts(
  tasks: TaskResource[],
  currentUserId: string,
  knownUserIds: ReadonlySet<string>,
): { total: number; inProgress: number; completed: number; closed: number } {
  const mine = filterTasks(tasks, {
    scope: 'mine',
    filter: '全部',
    query: '',
    currentUserId,
    knownUserIds,
  });
  return {
    total: mine.length,
    inProgress: mine.filter((task) => task.status === 'in_progress').length,
    completed: mine.filter((task) => task.status === 'completed').length,
    closed: mine.filter((task) => task.status === 'closed').length,
  };
}
