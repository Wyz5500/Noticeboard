/** Converts TypeORM graphs into raw domain snapshots and public timeline projections. */
import type { Actor } from '../../../identity/public/actor.js';
import type { IdentityAccountPersistenceRecord } from '../../../identity/public/persistence.js';
import { projectTaskTimeline } from '../../application/read-models/project-task-timeline.js';
import type { TaskReadModel } from '../../application/read-models/task-read-model.js';
import type {
  TaskEvent,
  TaskEventAction,
  TaskSnapshot,
  TaskStatus,
  TaskType,
} from '../../domain/task.types.js';
import type { TaskEventOrmEntity } from './entities/task-event.orm-entity.js';
import type { TaskOrmEntity } from './entities/task.orm-entity.js';

/** Converts an account record to a detached domain actor value. */
function toActor(entity: IdentityAccountPersistenceRecord): Actor {
  return {
    id: entity.id,
    username: entity.username,
    name: entity.name,
    role: entity.roleEntity?.code ?? 'user',
    roleLabel: entity.roleEntity?.name ?? '用户',
  };
}

/** Restores the immutable actor snapshot stored directly on one raw event row. */
function eventActor(event: TaskEventOrmEntity): Actor {
  return {
    id: event.actorId,
    username: event.actorUsername,
    name: event.actorName,
    role: event.actorRole,
    roleLabel: event.actorRoleName,
  };
}

/** Converts one raw event row to its discriminated domain event payload. */
function toDomainEvent(event: TaskEventOrmEntity): TaskEvent {
  const common = {
    sequence: event.sequence,
    actor: eventActor(event),
    at: event.at.toISOString(),
  };
  if (event.action === 'comment_created') {
    return {
      ...common,
      action: 'comment_created',
      commentId: event.commentId ?? '',
      content: event.content ?? '',
    };
  }
  if (event.action === 'comment_deleted') {
    return {
      ...common,
      action: 'comment_deleted',
      targetCommentId: event.targetCommentId ?? '',
    };
  }
  return {
    ...common,
    action: event.action as TaskEventAction,
    detail: event.detail,
  };
}

/** Converts a fully related task entity graph into a detached raw domain snapshot. */
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
      .map(toDomainEvent),
  };
}

/** Converts an ORM graph directly to a public read model without raw deletion events. */
export function taskEntityToReadModel(entity: TaskOrmEntity): TaskReadModel {
  const snapshot = taskEntityToSnapshot(entity);
  return {
    ...snapshot,
    timeline: projectTaskTimeline(snapshot.timeline),
  };
}
