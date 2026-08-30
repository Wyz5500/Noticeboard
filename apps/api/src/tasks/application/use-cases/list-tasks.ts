/** Exposes the task-list query without hydrating aggregates. */
import type { TaskQueryPort } from '../ports/task-query.port.js';
import type { TaskReadModel } from '../read-models/task-read-model.js';

export class ListTasks {
  /** Receives the read-only projection port required by the list use case. */
  constructor(private readonly query: TaskQueryPort) {}

  /** Returns all projections in the ordering guaranteed by the query port. */
  execute(): Promise<TaskReadModel[]> {
    return this.query.list();
  }
}
