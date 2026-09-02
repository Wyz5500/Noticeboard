/** Coordinates authorized comment creation inside the task optimistic transaction. */
import { randomUUID } from 'node:crypto';

import type { AuthorizationPort } from '../../../authorization/public/authorization.port.js';
import { AppError } from '../../../common/application/app-error.js';
import type { IdentityDirectoryPort } from '../../../identity/public/identity-directory.port.js';
import type { TaskClockPort } from '../ports/task-clock.port.js';
import type { TaskTransactionPort } from '../ports/task-transaction.port.js';
import { projectTask } from '../project-task.js';
import type { TaskViewModel } from '../read-models/task-read-model.js';
import { requireDemoActor } from '../require-demo-actor.js';
import { requirePermission } from '../require-permission.js';

export class AddTaskComment {
  /** Receives the task transaction, identity, authorization, ID, and business clock capabilities. */
  constructor(
    private readonly transaction: TaskTransactionPort,
    private readonly identities: IdentityDirectoryPort,
    private readonly authorization: AuthorizationPort,
    private readonly clock: TaskClockPort,
    private readonly nextId: () => string = () => `comment-${randomUUID()}`,
  ) {}

  /** Appends one comment only when the request version still matches the task. */
  async execute(
    actorId: string,
    taskId: string,
    content: string,
    expectedVersion: number,
  ): Promise<TaskViewModel> {
    await requirePermission(this.authorization, actorId, 'tasks.view');
    const actor = await requireDemoActor(this.identities, actorId);
    const reading = this.clock.read();
    return this.transaction.run(async (repository) => {
      const task = await repository.findById(taskId);
      if (!task) throw new AppError('TASK_NOT_FOUND', '任务不存在');
      if (!task.matchesVersion(expectedVersion)) {
        throw new AppError('CONFLICT', '任务已被其他操作更新');
      }
      task.addComment(this.nextId(), content, actor, reading.instant);
      await repository.save(task, expectedVersion);
      return projectTask(task.toSnapshot(), reading.currentDate);
    });
  }
}
