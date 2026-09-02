/** Projects persisted task workflow data into the current business-date view. */
import { deriveTaskEffectiveStatus } from '../domain/task.js';
import type { TaskSnapshot } from '../domain/task.types.js';
import type {
  TaskReadModel,
  TaskViewModel,
} from './read-models/task-read-model.js';

/** Adds the effective status while retaining the persisted workflow status. */
export function projectTask(
  task: TaskReadModel | TaskSnapshot,
  currentDate: string,
): TaskViewModel {
  return {
    ...task,
    workflowStatus: task.status,
    status: deriveTaskEffectiveStatus(task.status, task.dueDate, currentDate),
  };
}
