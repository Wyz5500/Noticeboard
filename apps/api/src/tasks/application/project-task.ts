/** Projects persisted task workflow data into the current business-date view. */
import { deriveTaskEffectiveStatus } from '../domain/task.js';
import type { TaskSnapshot } from '../domain/task.types.js';
import { projectTaskTimeline } from './read-models/project-task-timeline.js';
import type {
  TaskReadModel,
  TaskTimelineReadModel,
  TaskViewModel,
} from './read-models/task-read-model.js';

/** Recognizes a database read projection without relying on a non-empty timeline. */
function isProjectedTimeline(
  timeline: TaskSnapshot['timeline'] | TaskReadModel['timeline'],
): timeline is TaskTimelineReadModel[] {
  return timeline.every((event) => 'kind' in event);
}

/** Adds effective status and guarantees that raw deleted comment content is never returned. */
export function projectTask(
  task: TaskReadModel | TaskSnapshot,
  currentDate: string,
): TaskViewModel {
  return {
    ...task,
    workflowStatus: task.status,
    status: deriveTaskEffectiveStatus(task.status, task.dueDate, currentDate),
    timeline: isProjectedTimeline(task.timeline)
      ? task.timeline
      : projectTaskTimeline(task.timeline),
  };
}
