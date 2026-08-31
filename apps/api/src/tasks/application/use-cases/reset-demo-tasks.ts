/** Restores deterministic demo task state within one explicit transaction. */
import type { IdentityDirectoryPort } from '../../../identity/application/ports/identity-directory.port.js';
import { requireDemoActor } from '../../../identity/application/require-demo-actor.js';
import { requirePermission } from '../../../authorization/application/require-permission.js';
import type { AuthorizationPort } from '../../../authorization/application/ports/authorization.port.js';
import type { TaskTransactionPort } from '../ports/task-transaction.port.js';
import { createSeedTasks } from '../seed/create-seed-tasks.js';

export class ResetDemoTasks {
  /** Receives only identity resolution and task mutation transaction capabilities. */
  constructor(
    private readonly transaction: TaskTransactionPort,
    private readonly identities: IdentityDirectoryPort,
    private readonly authorization?: AuthorizationPort,
  ) {}

  /** Validates the demo actor and atomically replaces every task aggregate. */
  async execute(actorId: string): Promise<void> {
    if (this.authorization)
      await requirePermission(this.authorization, actorId, 'demo.reset');
    await requireDemoActor(this.identities, actorId);
    await this.transaction.run(async (repository) =>
      repository.replaceAll(createSeedTasks()),
    );
  }
}
