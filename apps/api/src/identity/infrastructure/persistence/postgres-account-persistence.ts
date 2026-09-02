/** Implements the public account persistence collaboration with the identity-owned ORM entity. */
import { IsNull, type EntityManager } from 'typeorm';

import type {
  CreateIdentityAccountRecord,
  IdentityAccountPersistence,
  IdentityAccountPersistenceRecord,
} from '../../public/persistence.js';
import { AccountOrmEntity } from './entities/account.orm-entity.js';

export class PostgresAccountPersistence implements IdentityAccountPersistence {
  /** Lists accounts with role metadata for detached administration projections. */
  list(manager: EntityManager): Promise<AccountOrmEntity[]> {
    return manager.getRepository(AccountOrmEntity).find({
      relations: { roleEntity: { rolePermissions: true } },
      order: { id: 'ASC' },
    });
  }

  /** Finds one account with the role graph required by authorization invariants. */
  findById(
    manager: EntityManager,
    id: string,
  ): Promise<AccountOrmEntity | null> {
    return manager.getRepository(AccountOrmEntity).findOne({
      where: { id },
      relations: { roleEntity: { rolePermissions: true } },
    });
  }

  /** Finds an active account only when its assigned role is also active. */
  findActiveById(
    manager: EntityManager,
    id: string,
  ): Promise<AccountOrmEntity | null> {
    return manager.getRepository(AccountOrmEntity).findOne({
      where: {
        id,
        deletedAt: IsNull(),
        roleEntity: { deletedAt: IsNull() },
      },
      relations: { roleEntity: { rolePermissions: true } },
    });
  }

  /** Creates and persists an account without exposing the ORM entity class. */
  async create(
    manager: EntityManager,
    values: CreateIdentityAccountRecord,
  ): Promise<AccountOrmEntity> {
    const repository = manager.getRepository(AccountOrmEntity);
    return repository.save(
      repository.create({ ...values, username: values.id }),
    );
  }

  /** Persists a loaded account through the identity-owned repository. */
  save(
    manager: EntityManager,
    account: IdentityAccountPersistenceRecord,
  ): Promise<AccountOrmEntity> {
    return manager.getRepository(AccountOrmEntity).save(account);
  }

  /** Counts active accounts whose active role grants system management. */
  countActiveManagementUsers(manager: EntityManager): Promise<number> {
    return manager
      .getRepository(AccountOrmEntity)
      .createQueryBuilder('account')
      .innerJoin('account.roleEntity', 'role')
      .innerJoin('role.rolePermissions', 'permission')
      .where('account.deleted_at IS NULL')
      .andWhere('role.deleted_at IS NULL')
      .andWhere('permission.permission_code = :permission', {
        permission: 'system.manage',
      })
      .getCount();
  }

  /** Counts active accounts assigned to one role. */
  countActiveForRole(manager: EntityManager, roleId: string): Promise<number> {
    return manager.getRepository(AccountOrmEntity).count({
      where: { roleId, deletedAt: IsNull() },
    });
  }

  /** Counts all accounts assigned to one role. */
  countForRole(manager: EntityManager, roleId: string): Promise<number> {
    return manager.getRepository(AccountOrmEntity).count({ where: { roleId } });
  }
}
