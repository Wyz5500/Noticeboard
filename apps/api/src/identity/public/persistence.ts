/** Defines narrow account persistence collaboration while keeping the ORM entity private. */
import type { EntityManager } from 'typeorm';

import type { AuthorizationRolePersistenceRecord } from '../../authorization/public/persistence.js';

export const IDENTITY_ACCOUNT_ENTITY = 'AccountOrmEntity';

export interface IdentityAccountPersistenceRecord {
  id: string;
  name: string;
  roleId: string;
  roleEntity: AuthorizationRolePersistenceRecord;
  deletedAt: Date | null;
  updatedAt: Date;
}

export interface CreateIdentityAccountRecord {
  id: string;
  name: string;
  roleId: string;
  roleEntity: AuthorizationRolePersistenceRecord;
  deletedAt: Date | null;
}

export interface IdentityAccountPersistence {
  /** Lists every account with its role relation, including deleted records. */
  list(manager: EntityManager): Promise<IdentityAccountPersistenceRecord[]>;

  /** Finds one account with role permissions, including deleted records. */
  findById(
    manager: EntityManager,
    id: string,
  ): Promise<IdentityAccountPersistenceRecord | null>;

  /** Finds one active account whose role is also active. */
  findActiveById(
    manager: EntityManager,
    id: string,
  ): Promise<IdentityAccountPersistenceRecord | null>;

  /** Creates and saves a new account inside the caller's transaction. */
  create(
    manager: EntityManager,
    values: CreateIdentityAccountRecord,
  ): Promise<IdentityAccountPersistenceRecord>;

  /** Saves one previously loaded account inside the caller's transaction. */
  save(
    manager: EntityManager,
    account: IdentityAccountPersistenceRecord,
  ): Promise<IdentityAccountPersistenceRecord>;

  /** Counts active accounts whose active role grants system management. */
  countActiveManagementUsers(manager: EntityManager): Promise<number>;

  /** Counts active accounts assigned to one role. */
  countActiveForRole(manager: EntityManager, roleId: string): Promise<number>;

  /** Counts all accounts assigned to one role. */
  countForRole(manager: EntityManager, roleId: string): Promise<number>;
}

export const IDENTITY_ACCOUNT_PERSISTENCE = Symbol(
  'IDENTITY_ACCOUNT_PERSISTENCE',
);
