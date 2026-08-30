/** Defines read-optimized task projection queries separately from aggregate persistence. */
import type { TaskReadModel } from '../read-models/task-read-model.js';

export interface TaskQueryPort {
  /** Lists all task projections in the public deterministic order. */
  list(): Promise<TaskReadModel[]>;

  /** Returns one complete task projection or null when absent. */
  getById(id: string): Promise<TaskReadModel | null>;
}

export const TASK_QUERY = Symbol('TASK_QUERY');
