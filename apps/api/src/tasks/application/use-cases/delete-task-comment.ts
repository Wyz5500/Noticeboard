/** Coordinates authorized comment deletion inside the task optimistic transaction. */
import type { AuthorizationPort } from '../../../authorization/public/authorization.port.js';
import { AppError } from '../../../common/application/app-error.js';
import type { IdentityDirectoryPort } from '../../../identity/public/identity-directory.port.js';
import type { TaskSnapshot } from '../../domain/task.types.js';
import type { TaskTransactionPort } from '../ports/task-transaction.port.js';
import { requireDemoActor } from '../require-demo-actor.js';
import { requirePermission } from '../require-permission.js';

export class DeleteTaskComment {
  /** Receives the task transaction, identity, clock, and live authorization capabilities. */
  constructor(
    private readonly transaction: TaskTransactionPort,
    private readonly identities: IdentityDirectoryPort,
    private readonly authorization: AuthorizationPort,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  /** Appends a deletion marker for the author or a current system manager. */
  async execute(
    actorId: string,
    taskId: string,
    commentId: string,
    expectedVersion: number,
  ): Promise<TaskSnapshot> {
    await requirePermission(this.authorization, actorId, 'tasks.view');
    const actor = await requireDemoActor(this.identities, actorId);
    const canManage = await this.authorization.hasPermission(
      actorId,
      'system.manage',
    );
    return this.transaction.run(async (repository) => {
      const task = await repository.findById(taskId);
      if (!task) throw new AppError('TASK_NOT_FOUND', '任务不存在');
      if (!task.matchesVersion(expectedVersion)) {
        throw new AppError('CONFLICT', '任务已被其他操作更新');
      }
      task.deleteComment(commentId, actor, canManage, this.now());
      await repository.save(task, expectedVersion);
      return task.toSnapshot();
    });
  }
}
