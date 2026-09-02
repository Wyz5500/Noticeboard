/** Seeds the three demo account records required by task foreign keys. */
import type { DataSource, EntityManager } from 'typeorm';

import { DEMO_ACTORS } from '../../public/demo-actors.js';
import { AccountOrmEntity } from './entities/account.orm-entity.js';

const DEMO_ADMIN = {
  id: 'noticeboard-admin',
  name: '公会管理员',
  roleId: 'role-system-admin',
  deletedAt: null,
};

/** Inserts missing demo identities without overwriting administrator-managed state. */
export async function seedDemoAccounts(
  target: DataSource | EntityManager,
): Promise<void> {
  const manager = 'manager' in target ? target.manager : target;
  await manager
    .createQueryBuilder()
    .insert()
    .into(AccountOrmEntity)
    .values([
      DEMO_ADMIN,
      ...DEMO_ACTORS.map((actor) => ({
        id: actor.id,
        name: actor.name,
        roleId: 'role-user',
        deletedAt: null,
      })),
    ])
    .orIgnore()
    .execute();
}
