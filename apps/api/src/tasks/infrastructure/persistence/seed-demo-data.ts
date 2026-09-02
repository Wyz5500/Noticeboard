/** Initializes task demo data once without crossing into identity persistence. */
import type { EntityManager } from 'typeorm';

import { createSeedTasks } from '../../application/seed/create-seed-tasks.js';
import { TaskOrmEntity } from './entities/task.orm-entity.js';
import { PostgresTaskRepository } from './postgres-task-repository.js';

/** Seeds initial tasks only when the task table is empty under a PostgreSQL lock. */
export async function seedDemoTasks(manager: EntityManager): Promise<void> {
  await manager.query('LOCK TABLE tasks IN SHARE ROW EXCLUSIVE MODE');
  if ((await manager.count(TaskOrmEntity)) > 0) return;
  const repository = new PostgresTaskRepository(manager);
  for (const task of createSeedTasks()) await repository.insert(task);
}
