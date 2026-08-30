/** Initializes demo data once without replacing durable task records during redeployment. */
import type { EntityManager } from 'typeorm';

import { seedDemoAccounts } from '../../../identity/infrastructure/persistence/seed-demo-accounts.js';
import { createSeedTasks } from '../../application/seed/create-seed-tasks.js';
import { TaskOrmEntity } from './entities/task.orm-entity.js';
import { PostgresTaskRepository } from './postgres-task-repository.js';

/** Seeds accounts and initial tasks only when the task table is empty under a PostgreSQL lock. */
export async function seedDemoData(manager: EntityManager): Promise<void> {
  await seedDemoAccounts(manager);
  await manager.query('LOCK TABLE tasks IN SHARE ROW EXCLUSIVE MODE');
  if ((await manager.count(TaskOrmEntity)) > 0) return;
  const repository = new PostgresTaskRepository(manager);
  for (const task of createSeedTasks()) await repository.insert(task);
}
