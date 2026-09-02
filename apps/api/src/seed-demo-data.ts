/** Coordinates Feature-owned seed operations at the API Composition Root. */
import type { EntityManager } from 'typeorm';

import { seedIdentityData } from './identity/public/composition/persistence.js';
import { seedTaskData } from './tasks/public/composition/persistence.js';

/** Seeds identities before tasks so PostgreSQL foreign keys remain satisfied. */
export async function seedDemoData(manager: EntityManager): Promise<void> {
  await seedIdentityData(manager);
  await seedTaskData(manager);
}
