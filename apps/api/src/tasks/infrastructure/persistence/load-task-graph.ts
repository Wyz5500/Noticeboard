/** Loads complete task graphs consistently for aggregate and projection adapters. */
import type { EntityManager, FindOptionsOrder } from 'typeorm';

import { TaskOrmEntity } from './entities/task.orm-entity.js';

const TASK_RELATIONS = {
  publisher: { roleEntity: true },
  assignee: { roleEntity: true },
  events: true,
} as const;

/** Loads one task with actor and ordered-event dependencies. */
export function loadTaskGraph(
  manager: EntityManager,
  id: string,
): Promise<TaskOrmEntity | null> {
  return manager
    .getRepository(TaskOrmEntity)
    .findOne({ where: { id }, relations: TASK_RELATIONS });
}

/** Loads every complete task graph in the public deterministic ordering. */
export function loadTaskGraphs(
  manager: EntityManager,
): Promise<TaskOrmEntity[]> {
  const order: FindOptionsOrder<TaskOrmEntity> = {
    createdAt: 'DESC',
    id: 'ASC',
  };
  return manager
    .getRepository(TaskOrmEntity)
    .find({ relations: TASK_RELATIONS, order });
}
