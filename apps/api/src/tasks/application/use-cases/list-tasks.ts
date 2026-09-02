/** Exposes the task-list query without hydrating aggregates. */
import type { AuthorizationPort } from '../../../authorization/public/authorization.port.js';
import type { TaskQueryPort } from '../ports/task-query.port.js';
import type { TaskReadModel } from '../read-models/task-read-model.js';
import { requirePermission } from '../require-permission.js';

export class ListTasks {
  /** Receives the read-only projection port required by the list use case. */
  constructor(
    private readonly query: TaskQueryPort,
    private readonly authorization?: AuthorizationPort,
  ) {}

  /** Returns all projections in the ordering guaranteed by the query port. */
  async execute(actorId?: string): Promise<TaskReadModel[]> {
    if (this.authorization && actorId)
      await requirePermission(this.authorization, actorId, 'tasks.view');
    return this.query.list();
  }
}
