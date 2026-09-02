/** Coordinates publisher-only expired-task renewal inside one optimistic transaction. */
import { AppError } from '../../../common/application/app-error.js';
import type { AuthorizationPort } from '../../../authorization/public/authorization.port.js';
import type { IdentityDirectoryPort } from '../../../identity/public/identity-directory.port.js';
import type { TaskRecoveryStrategy } from '../../domain/task.types.js';
import type { TaskClockPort } from '../ports/task-clock.port.js';
import type { TaskTransactionPort } from '../ports/task-transaction.port.js';
import { requireDemoActor } from '../require-demo-actor.js';
import { requirePermission } from '../require-permission.js';

export interface RenewExpiredTaskCommand {
  dueDate: string;
  recoveryStrategy: TaskRecoveryStrategy;
  expectedVersion: number;
}

export class RenewExpiredTask {
  /** Receives transaction, identity, clock, and optional authorization capabilities. */
  constructor(
    private readonly transaction: TaskTransactionPort,
    private readonly identities: IdentityDirectoryPort,
    private readonly clock: TaskClockPort,
    private readonly authorization?: AuthorizationPort,
  ) {}

  /** Renews one expired task if the caller owns it and its version is current. */
  async execute(
    actorId: string,
    taskId: string,
    command: RenewExpiredTaskCommand,
  ): Promise<void> {
    if (this.authorization) {
      await requirePermission(this.authorization, actorId, 'tasks.review');
      await requirePermission(this.authorization, actorId, 'tasks.view');
    }
    const actor = await requireDemoActor(this.identities, actorId);
    return this.transaction.run(async (repository) => {
      const task = await repository.findById(taskId);
      if (!task) throw new AppError('TASK_NOT_FOUND', '任务不存在');
      const reading = this.clock.read();
      task.renewExpired(actor, {
        dueDate: command.dueDate,
        recoveryStrategy: command.recoveryStrategy,
        currentDate: reading.currentDate,
        at: reading.instant,
      });
      await repository.save(task, command.expectedVersion);
    });
  }
}
