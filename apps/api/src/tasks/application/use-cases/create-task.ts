/** Coordinates identity resolution, aggregate creation, and transactional insertion. */
import type { IdentityDirectoryPort } from '../../../identity/application/ports/identity-directory.port.js';
import { requireDemoActor } from '../../../identity/application/require-demo-actor.js';
import { requirePermission } from '../../../authorization/application/require-permission.js';
import type { AuthorizationPort } from '../../../authorization/application/ports/authorization.port.js';
import { Task } from '../../domain/task.js';
import type { TaskSnapshot, TaskType } from '../../domain/task.types.js';
import type { TaskTransactionPort } from '../ports/task-transaction.port.js';

export interface CreateTaskCommand {
  title: string;
  type: TaskType;
  description: string;
  reward: string;
  dueDate: string;
}

export class CreateTask {
  /** Receives explicit mutation capabilities plus deterministic ID and clock providers. */
  constructor(
    private readonly transaction: TaskTransactionPort,
    private readonly identities: IdentityDirectoryPort,
    private readonly nextId: () => string,
    private readonly now: () => string,
    private readonly authorization?: AuthorizationPort,
  ) {}

  /** Creates and inserts one task owned by the exact demo actor. */
  async execute(
    actorId: string,
    command: CreateTaskCommand,
  ): Promise<TaskSnapshot> {
    if (this.authorization)
      await requirePermission(this.authorization, actorId, 'tasks.create');
    const actor = await requireDemoActor(this.identities, actorId);
    const task = Task.create(
      { id: this.nextId(), ...command },
      actor,
      this.now(),
    );
    await this.transaction.run(async (repository) => repository.insert(task));
    return task.toSnapshot();
  }
}
