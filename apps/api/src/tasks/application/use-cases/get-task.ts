/** Exposes a complete task detail projection with stable not-found semantics. */
import { AppError } from '../../../common/application/app-error.js';
import type { TaskQueryPort } from '../ports/task-query.port.js';
import type { TaskReadModel } from '../read-models/task-read-model.js';

export class GetTask {
  /** Receives only the read-only projection port. */
  constructor(private readonly query: TaskQueryPort) {}

  /** Returns one projection or a transport-independent not-found failure. */
  async execute(taskId: string): Promise<TaskReadModel> {
    const task = await this.query.getById(taskId);
    if (!task) throw new AppError('TASK_NOT_FOUND', '任务不存在');
    return task;
  }
}
