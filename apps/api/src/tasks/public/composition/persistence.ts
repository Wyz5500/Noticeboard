/** Supplies task persistence registration and seed behavior to the API Composition Root. */
import type { EntityManager, ObjectType } from 'typeorm';

import { TaskEventOrmEntity } from '../../infrastructure/persistence/entities/task-event.orm-entity.js';
import { TaskOrmEntity } from '../../infrastructure/persistence/entities/task.orm-entity.js';
import { seedDemoTasks } from '../../infrastructure/persistence/seed-demo-data.js';

/** Returns task-owned ORM entities without exporting their implementation classes. */
export function taskPersistenceEntities(): readonly ObjectType<object>[] {
  return [TaskOrmEntity, TaskEventOrmEntity];
}

/** Runs task-owned deployment seed behavior inside the caller's transaction. */
export function seedTaskData(manager: EntityManager): Promise<void> {
  return seedDemoTasks(manager);
}
