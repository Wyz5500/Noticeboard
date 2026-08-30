/** Converts TypeORM graphs into domain snapshots and independent read projections. */
import type {
  Actor,
  TaskEventAction,
  TaskSnapshot,
  TaskStatus,
  TaskType,
} from '../../domain/task.types.js';
import type { TaskReadModel } from '../../application/read-models/task-read-model.js';
import type { AccountOrmEntity } from '../../../identity/infrastructure/persistence/entities/account.orm-entity.js';
import type { TaskOrmEntity } from './entities/task.orm-entity.js';

/** Converts an account record to a detached domain actor value. */
function toActor(entity: AccountOrmEntity): Actor {
  return { id: entity.id, name: entity.name, role: 'user' };
}

/** Converts a fully related task entity graph into a detached domain snapshot. */
export function taskEntityToSnapshot(entity: TaskOrmEntity): TaskSnapshot {
  return {
    id: entity.id,
    title: entity.title,
    type: entity.type as TaskType,
    description: entity.description,
    reward: entity.reward,
    dueDate: entity.dueDate,
    publisher: toActor(entity.publisher),
    assignee: entity.assignee ? toActor(entity.assignee) : null,
    status: entity.status as TaskStatus,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
    version: entity.version,
    timeline: entity.events
      .slice()
      .sort((left, right) => left.sequence - right.sequence)
      .map((event) => ({
        sequence: event.sequence,
        action: event.action as TaskEventAction,
        actor: {
          id: event.actorId,
          name: event.actorName,
          role: event.actorRole as 'user',
        },
        at: event.at.toISOString(),
        detail: event.detail,
      })),
  };
}

/** Converts an ORM graph directly to a read model without returning the ORM entity. */
export function taskEntityToReadModel(entity: TaskOrmEntity): TaskReadModel {
  return taskEntityToSnapshot(entity);
}
