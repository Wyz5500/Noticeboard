/** Coordinates authorized comment editing inside the task optimistic transaction. */
import type { AuthorizationPort } from '../../../authorization/public/authorization.port.js';
import { AppError } from '../../../common/application/app-error.js';
import type { IdentityDirectoryPort } from '../../../identity/public/identity-directory.port.js';
import type { TaskClockPort } from '../ports/task-clock.port.js';
import type { TaskTransactionPort } from '../ports/task-transaction.port.js';
import { projectTask } from '../project-task.js';
import type { TaskViewModel } from '../read-models/task-read-model.js';
import { requireDemoActor } from '../require-demo-actor.js';
import { requirePermission } from '../require-permission.js';

export class EditTaskComment {
  /** Receives the task transaction, identity, authorization, and business clock capabilities. */
  constructor(
    private readonly transaction: TaskTransactionPort,
    private readonly identities: IdentityDirectoryPort,
    private readonly authorization: AuthorizationPort,
    private readonly clock: TaskClockPort,
  ) {}

  /** Appends one comment revision only when the actor and request version remain valid. */
  async execute(
    actorId: string,
    taskId: string,
    commentId: string,
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
      task.editComment(commentId, content, actor, reading.instant);
      await repository.save(task, expectedVersion);
      return projectTask(task.toSnapshot(), reading.currentDate);
    });
  }
}
