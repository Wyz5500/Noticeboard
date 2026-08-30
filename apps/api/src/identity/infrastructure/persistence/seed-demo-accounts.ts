/** Seeds the three demo account records required by task foreign keys. */
import type { DataSource, EntityManager } from 'typeorm';

import { DEMO_ACTORS } from '../../domain/demo-actors.js';
import { AccountOrmEntity } from './entities/account.orm-entity.js';

/** Upserts stable demo identities using either a DataSource or transaction manager. */
export async function seedDemoAccounts(
  target: DataSource | EntityManager,
): Promise<void> {
  const manager = 'manager' in target ? target.manager : target;
  await manager.getRepository(AccountOrmEntity).upsert(
    DEMO_ACTORS.map((actor) => ({ ...actor })),
    ['id'],
  );
}
