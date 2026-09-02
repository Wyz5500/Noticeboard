/** Exposes the task-list query without hydrating aggregates. */
import type { AuthorizationPort } from '../../../authorization/public/authorization.port.js';
import type { TaskClockPort } from '../ports/task-clock.port.js';
import type { TaskQueryPort } from '../ports/task-query.port.js';
import { projectTask } from '../project-task.js';
import type { TaskViewModel } from '../read-models/task-read-model.js';
import { requirePermission } from '../require-permission.js';

export class ListTasks {
  /** Receives the read-only projection port required by the list use case. */
  constructor(
    private readonly query: TaskQueryPort,
    private readonly clock: TaskClockPort,
    private readonly authorization?: AuthorizationPort,
  ) {}

  /** Returns all projections in the ordering guaranteed by the query port. */
  async execute(actorId?: string): Promise<TaskViewModel[]> {
    if (this.authorization && actorId)
      await requirePermission(this.authorization, actorId, 'tasks.view');
    const { currentDate } = this.clock.read();
    return (await this.query.list()).map((task) =>
      projectTask(task, currentDate),
    );
  }
}
