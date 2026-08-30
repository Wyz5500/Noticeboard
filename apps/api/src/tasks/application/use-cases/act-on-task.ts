/** Coordinates authorized task actions inside an explicit optimistic transaction. */
import { AppError } from '../../../common/application/app-error.js';
import type { IdentityDirectoryPort } from '../../../identity/application/ports/identity-directory.port.js';
import { requireDemoActor } from '../../../identity/application/require-demo-actor.js';
import type { TaskAction } from '../../domain/task.types.js';
import type { TaskTransactionPort } from '../ports/task-transaction.port.js';

export class ActOnTask {
  /** Receives only identity resolution, task transaction, and clock capabilities. */
  constructor(
    private readonly transaction: TaskTransactionPort,
    private readonly identities: IdentityDirectoryPort,
    private readonly now: () => string,
  ) {}

  /** Applies one action if both the loaded and persisted versions match the request. */
  async execute(
    actorId: string,
    taskId: string,
    action: TaskAction,
    expectedVersion: number,
  ): Promise<void> {
    const actor = await requireDemoActor(this.identities, actorId);
    return this.transaction.run(async (repository) => {
      const task = await repository.findById(taskId);
      if (!task) throw new AppError('TASK_NOT_FOUND', '任务不存在');
      if (task.toSnapshot().version !== expectedVersion) {
        throw new AppError('CONFLICT', '任务已被其他操作更新');
      }
      task.act(action, actor, this.now());
      await repository.save(task, expectedVersion);
    });
  }
}
