/** Supplies authorization persistence registration exclusively to the API Composition Root. */
import type { ObjectType } from 'typeorm';

import { RolePermissionOrmEntity } from '../../infrastructure/persistence/entities/role-permission.orm-entity.js';
import { RoleOrmEntity } from '../../infrastructure/persistence/entities/role.orm-entity.js';

/** Returns authorization-owned ORM entities without exporting their implementation classes. */
export function authorizationPersistenceEntities(): readonly ObjectType<object>[] {
  return [RoleOrmEntity, RolePermissionOrmEntity];
}
