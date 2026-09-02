/** Coordinates identity resolution, aggregate creation, and transactional insertion. */
import type { AuthorizationPort } from '../../../authorization/public/authorization.port.js';
import type { IdentityDirectoryPort } from '../../../identity/public/identity-directory.port.js';
import { Task } from '../../domain/task.js';
import type { TaskType } from '../../domain/task.types.js';
import type { TaskClockPort } from '../ports/task-clock.port.js';
import type { TaskTransactionPort } from '../ports/task-transaction.port.js';
import { projectTask } from '../project-task.js';
import type { TaskViewModel } from '../read-models/task-read-model.js';
import { requireDemoActor } from '../require-demo-actor.js';
import { requirePermission } from '../require-permission.js';

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
    private readonly clock: TaskClockPort,
    private readonly authorization?: AuthorizationPort,
  ) {}

  /** Creates and inserts one task owned by the exact demo actor. */
  async execute(
    actorId: string,
    command: CreateTaskCommand,
  ): Promise<TaskViewModel> {
    if (this.authorization)
      await requirePermission(this.authorization, actorId, 'tasks.create');
    const actor = await requireDemoActor(this.identities, actorId);
    const reading = this.clock.read();
    const task = Task.create(
      { id: this.nextId(), ...command },
      actor,
      reading.instant,
    );
    await this.transaction.run(async (repository) => repository.insert(task));
    return projectTask(task.toSnapshot(), reading.currentDate);
  }
}
