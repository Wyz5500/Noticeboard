/** Implements aggregate persistence with conditional version updates and append-only events. */
import type { EntityManager } from 'typeorm';

import { AppError } from '../../../common/application/app-error.js';
import type { TaskRepositoryPort } from '../../application/ports/task-repository.port.js';
import { Task } from '../../domain/task.js';
import type { TaskEvent, TaskSnapshot } from '../../domain/task.types.js';
import { TaskEventOrmEntity } from './entities/task-event.orm-entity.js';
import { TaskOrmEntity } from './entities/task.orm-entity.js';
import { loadTaskGraph } from './load-task-graph.js';
import { taskEntityToSnapshot } from './task-orm-mapper.js';

/** Maps aggregate fields to a task-row insertion or conditional update payload. */
function taskRow(snapshot: TaskSnapshot): Partial<TaskOrmEntity> {
  return {
    id: snapshot.id,
    title: snapshot.title,
    type: snapshot.type,
    description: snapshot.description,
    reward: snapshot.reward,
    dueDate: snapshot.dueDate,
    publisherId: snapshot.publisher.id,
    assigneeId: snapshot.assignee?.id ?? null,
    status: snapshot.status,
    createdAt: new Date(snapshot.createdAt),
    updatedAt: new Date(snapshot.updatedAt),
    version: snapshot.version,
  };
}

/** Maps domain events to append-only event-row payloads. */
function eventRows(
  taskId: string,
  events: TaskEvent[],
): Partial<TaskEventOrmEntity>[] {
  return events.map((event) => ({
    taskId,
    sequence: event.sequence,
    action: event.action,
    actorId: event.actor.id,
    actorName: event.actor.name,
    actorRole: event.actor.role,
    actorRoleName: event.actor.roleLabel ?? '用户',
    at: new Date(event.at),
    detail: event.detail,
  }));
}

export class PostgresTaskRepository implements TaskRepositoryPort {
  /** Binds aggregate persistence to the transaction manager supplied by the adapter. */
  constructor(private readonly manager: EntityManager) {}

  /** Restores a complete task aggregate by ID. */
  async findById(id: string): Promise<Task | null> {
    const entity = await loadTaskGraph(this.manager, id);
    return entity ? Task.restore(taskEntityToSnapshot(entity)) : null;
  }

  /** Inserts a task row and every existing event in the current transaction. */
  async insert(task: Task): Promise<void> {
    const snapshot = task.toSnapshot();
    await this.manager.insert(TaskOrmEntity, taskRow(snapshot));
    if (snapshot.timeline.length) {
      await this.manager.insert(
        TaskEventOrmEntity,
        eventRows(snapshot.id, snapshot.timeline),
      );
    }
  }

  /** Conditionally updates a task version before appending only its newly created events. */
  async save(task: Task, expectedVersion: number): Promise<void> {
    const snapshot = task.toSnapshot();
    const result = await this.manager
      .createQueryBuilder()
      .update(TaskOrmEntity)
      .set(taskRow(snapshot))
      .where('id = :id', { id: snapshot.id })
      .andWhere('version = :expectedVersion', { expectedVersion })
      .execute();
    if (result.affected !== 1)
      throw new AppError('CONFLICT', '任务已被其他操作更新');

    const raw = await this.manager
      .getRepository(TaskEventOrmEntity)
      .createQueryBuilder('event')
      .select('COALESCE(MAX(event.sequence), 0)', 'maximum')
      .where('event.taskId = :taskId', { taskId: snapshot.id })
      .getRawOne<{ maximum: string | number }>();
    const maximum = Number(raw?.maximum ?? 0);
    const appended = snapshot.timeline.filter(
      (event) => event.sequence > maximum,
    );
    if (appended.length)
      await this.manager.insert(
        TaskEventOrmEntity,
        eventRows(snapshot.id, appended),
      );
  }

  /** Removes existing aggregates and inserts the supplied reset set with their histories. */
  async replaceAll(tasks: Task[]): Promise<void> {
    await this.manager
      .createQueryBuilder()
      .delete()
      .from(TaskEventOrmEntity)
      .execute();
    await this.manager
      .createQueryBuilder()
      .delete()
      .from(TaskOrmEntity)
      .execute();
    for (const task of tasks) await this.insert(task);
  }
}
