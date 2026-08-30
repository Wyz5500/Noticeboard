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

/** Calculates home statistics for every task-board status without changing task data. */
export function taskCounts(tasks: TaskResource[]): {
  total: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  reopened: number;
  closed: number;
} {
  return {
    total: tasks.length,
    notStarted: tasks.filter((task) => task.status === 'not_started').length,
    inProgress: tasks.filter((task) => task.status === 'in_progress').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    reopened: tasks.filter((task) => task.status === 'reopened').length,
    closed: tasks.filter((task) => task.status === 'closed').length,
  };
}
