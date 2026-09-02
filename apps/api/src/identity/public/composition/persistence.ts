/** Supplies identity-owned persistence registration exclusively to the API Composition Root. */
import type { EntityManager, ObjectType } from 'typeorm';

import { AccountOrmEntity } from '../../infrastructure/persistence/entities/account.orm-entity.js';
import { seedDemoAccounts } from '../../infrastructure/persistence/seed-demo-accounts.js';

/** Returns identity-owned ORM entities without exporting their implementation classes. */
export function identityPersistenceEntities(): readonly ObjectType<object>[] {
  return [AccountOrmEntity];
}

/** Runs identity-owned deployment seed behavior inside the caller's transaction. */
export function seedIdentityData(manager: EntityManager): Promise<void> {
  return seedDemoAccounts(manager);
}
