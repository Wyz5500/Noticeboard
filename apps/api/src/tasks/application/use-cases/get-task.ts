/** Exposes a complete task detail projection with stable not-found semantics. */
import { AppError } from '../../../common/application/app-error.js';
import type { AuthorizationPort } from '../../../authorization/public/authorization.port.js';
import type { TaskClockPort } from '../ports/task-clock.port.js';
import type { TaskQueryPort } from '../ports/task-query.port.js';
import { projectTask } from '../project-task.js';
import type { TaskViewModel } from '../read-models/task-read-model.js';
import { requirePermission } from '../require-permission.js';

export class GetTask {
  /** Receives only the read-only projection port. */
  constructor(
    private readonly query: TaskQueryPort,
    private readonly clock: TaskClockPort,
    private readonly authorization?: AuthorizationPort,
  ) {}

  /** Returns one projection or a transport-independent not-found failure. */
  async execute(taskId: string, actorId?: string): Promise<TaskViewModel> {
    if (this.authorization && actorId)
      await requirePermission(this.authorization, actorId, 'tasks.view');
    const task = await this.query.getById(taskId);
    if (!task) throw new AppError('TASK_NOT_FOUND', '任务不存在');
    return projectTask(task, this.clock.read().currentDate);
  }
}
