/** Implements authorization decisions and admin mutations with explicit PostgreSQL transactions. */
import { randomUUID } from 'node:crypto';
import {
  IsNull,
  QueryFailedError,
  type DataSource,
  type EntityManager,
} from 'typeorm';

import { AppError } from '../../common/application/app-error.js';
import {
  ALL_PERMISSION_CODES,
  type PermissionCode,
} from '../domain/permission.js';
import { Role } from '../domain/role.js';
import { AuthorizationDomainError } from '../domain/domain-error.js';
import type {
  AdminOverviewModel,
  AdminRoleModel,
  AdminUserModel,
  AuthorizationManagementPort,
  CreateAdminRoleCommand,
  CreateAdminUserCommand,
  UpdateAdminRoleCommand,
  UpdateAdminUserCommand,
} from '../application/ports/authorization-management.port.js';
import type { AuthorizationPort } from '../application/ports/authorization.port.js';
import { RolePermissionOrmEntity } from './persistence/entities/role-permission.orm-entity.js';
import { RoleOrmEntity } from './persistence/entities/role.orm-entity.js';
import { AccountOrmEntity } from '../../identity/infrastructure/persistence/entities/account.orm-entity.js';

const PERMISSIONS: readonly {
  code: PermissionCode;
  name: string;
  description: string;
}[] = [
  { code: 'system.manage', name: '系统管理', description: '管理用户与角色' },
  { code: 'tasks.view', name: '查看任务', description: '查看任务列表与详情' },
  { code: 'tasks.create', name: '发布任务', description: '发布新的任务' },
  { code: 'tasks.accept', name: '接取任务', description: '接取任务' },
  { code: 'tasks.complete', name: '完成任务', description: '完成已接取任务' },
  { code: 'tasks.review', name: '验收任务', description: '验收或退回任务' },
  { code: 'tasks.close', name: '关闭任务', description: '关闭任务' },
  { code: 'demo.reset', name: '重置演示数据', description: '重置演示任务数据' },
];

const MANAGEMENT_INVARIANT_LOCK_KEY = 1788062402;
const ROLE_NAME_LOCK_KEY = 1788062403;
const ROLE_ASSIGNMENT_LOCK_KEY = 1788062404;
const ROLE_LIFECYCLE_LOCK_KEY = 1788062405;

/** Identifies the PostgreSQL unique-index error for active role names. */
function isRoleNameUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError = error.driverError as {
    code?: string;
    constraint?: string;
  };
  return (
    driverError.code === '23505' &&
    driverError.constraint === 'roles_active_name_idx'
  );
}

/** Converts an account relation into the admin-facing detached user model. */
function toUser(account: AccountOrmEntity): AdminUserModel {
  return {
    id: account.id,
    name: account.name,
    roleId: account.roleId,
    roleCode: account.roleEntity.code,
    roleName: account.roleEntity.name,
    active: account.deletedAt === null,
    deletedAt: account.deletedAt?.toISOString() ?? null,
    updatedAt: account.updatedAt.toISOString(),
  };
}

/** Converts a role relation and its permission rows into a detached admin model. */
function toRole(role: RoleOrmEntity): AdminRoleModel {
  const permissions = role.rolePermissions
    .map((permission) => permission.permissionCode)
    .filter((permission): permission is PermissionCode =>
      ALL_PERMISSION_CODES.includes(permission as PermissionCode),
    );
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    builtin: role.builtin,
    permissions,
    active: role.deletedAt === null,
    deletedAt: role.deletedAt?.toISOString() ?? null,
    updatedAt: role.updatedAt.toISOString(),
  };
}

/** Returns a role with all permission rows loaded for one transaction. */
async function findRole(
  manager: EntityManager,
  id: string,
): Promise<RoleOrmEntity> {
  const role = await manager.getRepository(RoleOrmEntity).findOne({
    where: { id },
    relations: { rolePermissions: true },
  });
  if (!role) throw new AppError('ROLE_NOT_FOUND', '角色不存在');
  return role;
}

/** Returns an account with its role relation loaded for one transaction. */
async function findAccount(
  manager: EntityManager,
  id: string,
): Promise<AccountOrmEntity> {
  const account = await manager.getRepository(AccountOrmEntity).findOne({
    where: { id },
    relations: { roleEntity: { rolePermissions: true } },
  });
  if (!account) throw new AppError('USER_NOT_FOUND', '用户不存在');
  return account;
}

export class PostgresAuthorization
  implements AuthorizationPort, AuthorizationManagementPort
{
  /** Binds authorization decisions and management commands to the shared DataSource. */
  constructor(private readonly dataSource: DataSource) {}

  /** Checks active account, active role, and role permission membership atomically. */
  async hasPermission(
    userId: string,
    permission: PermissionCode,
  ): Promise<boolean> {
    const account = await this.dataSource
      .getRepository(AccountOrmEntity)
      .findOne({
        where: {
          id: userId,
          deletedAt: IsNull(),
          roleEntity: { deletedAt: IsNull() },
        },
        relations: { roleEntity: { rolePermissions: true } },
      });
    return Boolean(
      account?.roleEntity.rolePermissions.some(
        (candidate) => candidate.permissionCode === permission,
      ),
    );
  }

  /** Returns all accounts and roles, including soft-deleted records for administrators. */
  async overview(): Promise<AdminOverviewModel> {
    const [users, roles] = await Promise.all([
      this.dataSource.getRepository(AccountOrmEntity).find({
        relations: { roleEntity: true },
        order: { id: 'ASC' },
      }),
      this.dataSource.getRepository(RoleOrmEntity).find({
        relations: { rolePermissions: true },
        order: { builtin: 'DESC', name: 'ASC', id: 'ASC' },
      }),
    ]);
    return {
      users: users.map(toUser),
      roles: roles.map(toRole),
      permissions: PERMISSIONS.map((permission) => ({ ...permission })),
    };
  }

  /** Creates an account with a server-generated ID and an active role. */
  createUser(command: CreateAdminUserCommand): Promise<AdminUserModel> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockRoleAssignment(manager);
      const role = await findRole(manager, command.roleId);
      if (role.deletedAt) throw new AppError('CONFLICT', '不能绑定已删除角色');
      const name = command.name.trim();
      if (!name) throw new AppError('VALIDATION_FAILED', '请填写用户名称');
      const account = manager.getRepository(AccountOrmEntity).create({
        id: `user-${randomUUID()}`,
        name,
        roleId: role.id,
        deletedAt: null,
        roleEntity: role,
      });
      await manager.getRepository(AccountOrmEntity).save(account);
      return toUser(account);
    });
  }

  /** Updates a user's name or role while preserving the final management user invariant. */
  updateUser(
    id: string,
    command: UpdateAdminUserCommand,
  ): Promise<AdminUserModel> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockRoleAssignment(manager);
      await this.lockManagementInvariant(manager);
      const account = await findAccount(manager, id);
      const nextRole = command.roleId
        ? await findRole(manager, command.roleId)
        : account.roleEntity;
      if (nextRole.deletedAt)
        throw new AppError('CONFLICT', '不能绑定已删除角色');
      const currentHasManagement = account.roleEntity.rolePermissions.some(
        (permission) => permission.permissionCode === 'system.manage',
      );
      const nextHasManagement = nextRole.rolePermissions.some(
        (permission) => permission.permissionCode === 'system.manage',
      );
      if (currentHasManagement && !nextHasManagement && !account.deletedAt) {
        await this.assertNotLastManagementUser(manager);
      }
      if (command.name !== undefined) {
        const name = command.name.trim();
        if (!name) throw new AppError('VALIDATION_FAILED', '请填写用户名称');
        account.name = name;
      }
      account.roleId = nextRole.id;
      account.roleEntity = nextRole;
      await manager.getRepository(AccountOrmEntity).save(account);
      return toUser(account);
    });
  }

  /** Soft-deletes a user unless doing so would remove the final active administrator. */
  softDeleteUser(id: string): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockManagementInvariant(manager);
      const account = await findAccount(manager, id);
      if (!account.deletedAt) {
        const hasManagement = account.roleEntity.rolePermissions.some(
          (permission) => permission.permissionCode === 'system.manage',
        );
        if (hasManagement) await this.assertNotLastManagementUser(manager);
        account.deletedAt = new Date();
        await manager.getRepository(AccountOrmEntity).save(account);
      }
    });
  }

  /** Restores one deleted account while requiring its role to remain active. */
  restoreUser(id: string): Promise<AdminUserModel> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockRoleAssignment(manager);
      await this.lockManagementInvariant(manager);
      const account = await findAccount(manager, id);
      if (account.roleEntity.deletedAt)
        throw new AppError('CONFLICT', '请先恢复用户绑定的角色');
      account.deletedAt = null;
      await manager.getRepository(AccountOrmEntity).save(account);
      return toUser(account);
    });
  }

  /** Creates a custom role with no permissions by default. */
  createRole(command: CreateAdminRoleCommand): Promise<AdminRoleModel> {
    return this.withRoleNameConflict(() =>
      this.dataSource.transaction(async (manager) => {
        await this.lockRoleNames(manager);
        const name = command.name.trim();
        if (!name) throw new AppError('VALIDATION_FAILED', '请填写角色名称');
        await this.assertUniqueActiveRoleName(manager, name);
        const role = Role.createCustom(
          `role-${randomUUID()}`,
          name,
          command.permissions ?? [],
        ).toSnapshot();
        const entity = manager.getRepository(RoleOrmEntity).create(role);
        await manager.getRepository(RoleOrmEntity).save(entity);
        const permissions = role.permissions.map((permissionCode) =>
          manager
            .getRepository(RolePermissionOrmEntity)
            .create({ roleId: role.id, permissionCode }),
        );
        if (permissions.length)
          await manager
            .getRepository(RolePermissionOrmEntity)
            .insert(permissions);
        entity.rolePermissions = permissions;
        return toRole(entity);
      }),
    );
  }

  /** Updates role permissions and name while keeping built-in identity immutable. */
  updateRole(
    id: string,
    command: UpdateAdminRoleCommand,
  ): Promise<AdminRoleModel> {
    return this.withRoleNameConflict(() =>
      this.dataSource.transaction(async (manager) => {
        await this.lockRoleNames(manager);
        await this.lockRoleLifecycle(manager);
        const entity = await findRole(manager, id);
        const current = toRole(entity);
        const role = Role.restore({
          id: entity.id,
          code: entity.code,
          name: entity.name,
          builtin: entity.builtin,
          permissions: current.permissions,
          deletedAt: current.deletedAt,
        });
        try {
          role.update(command.name, command.permissions);
        } catch (error) {
          if (error instanceof AuthorizationDomainError)
            throw new AppError('VALIDATION_FAILED', error.message);
          throw error;
        }
        const next = role.toSnapshot();
        if (next.name !== entity.name)
          await this.assertUniqueActiveRoleName(manager, next.name, id);
        const removesManagement =
          current.permissions.includes('system.manage') &&
          !command.permissions.includes('system.manage');
        if (removesManagement) {
          await this.lockManagementInvariant(manager);
          const assigned = await this.countActiveAccountsForRole(manager, id);
          const total = await this.countActiveManagementUsers(manager);
          if (total <= assigned)
            throw new AppError(
              'CONFLICT',
              '至少保留一名拥有系统管理权限的活跃用户',
            );
        }
        entity.name = next.name;
        entity.updatedAt = new Date();
        entity.rolePermissions = next.permissions.map((permissionCode) => ({
          roleId: id,
          permissionCode,
        })) as RolePermissionOrmEntity[];
        await manager
          .getRepository(RolePermissionOrmEntity)
          .delete({ roleId: id });
        await manager.getRepository(RoleOrmEntity).save(entity);
        if (entity.rolePermissions.length)
          await manager
            .getRepository(RolePermissionOrmEntity)
            .insert(entity.rolePermissions);
        return toRole(entity);
      }),
    );
  }

  /** Soft-deletes an unbound custom role. */
  softDeleteRole(id: string): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockRoleNames(manager);
      await this.lockRoleLifecycle(manager);
      await this.lockRoleAssignment(manager);
      const role = await findRole(manager, id);
      if (role.builtin) throw new AppError('CONFLICT', '内置角色不可删除');
      if ((await this.countAccountsForRole(manager, id)) > 0)
        throw new AppError('ROLE_IN_USE', '角色仍被用户绑定，请先改派用户');
      role.deletedAt = new Date();
      await manager.getRepository(RoleOrmEntity).save(role);
    });
  }

  /** Restores a custom role after confirming its name remains unique. */
  restoreRole(id: string): Promise<AdminRoleModel> {
    return this.withRoleNameConflict(() =>
      this.dataSource.transaction(async (manager) => {
        await this.lockRoleNames(manager);
        await this.lockRoleLifecycle(manager);
        await this.lockRoleAssignment(manager);
        const role = await findRole(manager, id);
        if (role.builtin) return toRole(role);
        await this.assertUniqueActiveRoleName(manager, role.name, id);
        role.deletedAt = null;
        await manager.getRepository(RoleOrmEntity).save(role);
        return toRole(role);
      }),
    );
  }

  /** Serializes all transactions that can affect the final management user invariant. */
  private lockManagementInvariant(manager: EntityManager): Promise<void> {
    return manager.query('SELECT pg_advisory_xact_lock(CAST($1 AS bigint))', [
      MANAGEMENT_INVARIANT_LOCK_KEY,
    ]);
  }

  /** Serializes role-name preflight checks with their subsequent writes. */
  private lockRoleNames(manager: EntityManager): Promise<void> {
    return manager.query('SELECT pg_advisory_xact_lock(CAST($1 AS bigint))', [
      ROLE_NAME_LOCK_KEY,
    ]);
  }

  /** Serializes role lifecycle reads and writes across updates, deletions, and restores. */
  private lockRoleLifecycle(manager: EntityManager): Promise<void> {
    return manager.query('SELECT pg_advisory_xact_lock(CAST($1 AS bigint))', [
      ROLE_LIFECYCLE_LOCK_KEY,
    ]);
  }

  /** Serializes role lifecycle changes with account role assignments. */
  private lockRoleAssignment(manager: EntityManager): Promise<void> {
    return manager.query('SELECT pg_advisory_xact_lock(CAST($1 AS bigint))', [
      ROLE_ASSIGNMENT_LOCK_KEY,
    ]);
  }

  /** Converts a database-enforced active role-name race into the public conflict error. */
  private async withRoleNameConflict<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isRoleNameUniqueViolation(error))
        throw new AppError('CONFLICT', '活跃角色名称已存在');
      throw error;
    }
  }

  /** Rejects a transition that would leave no active account with system management. */
  private async assertNotLastManagementUser(
    manager: EntityManager,
  ): Promise<void> {
    if ((await this.countActiveManagementUsers(manager)) <= 1)
      throw new AppError('CONFLICT', '至少保留一名拥有系统管理权限的活跃用户');
  }

  /** Counts active accounts whose active role has the management permission. */
  private countActiveManagementUsers(manager: EntityManager): Promise<number> {
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
  private countActiveAccountsForRole(
    manager: EntityManager,
    roleId: string,
  ): Promise<number> {
    return manager.getRepository(AccountOrmEntity).count({
      where: { roleId, deletedAt: IsNull() },
    });
  }

  /** Counts all accounts assigned to one role for safe role deletion. */
  private countAccountsForRole(
    manager: EntityManager,
    roleId: string,
  ): Promise<number> {
    return manager.getRepository(AccountOrmEntity).count({ where: { roleId } });
  }

  /** Rejects active role-name duplicates while allowing a role to retain its own name. */
  private async assertUniqueActiveRoleName(
    manager: EntityManager,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    if (!name) throw new AppError('VALIDATION_FAILED', '请填写角色名称');
    const query = manager
      .getRepository(RoleOrmEntity)
      .createQueryBuilder('role')
      .where('role.name = :name', { name })
      .andWhere('role.deleted_at IS NULL');
    if (exceptId) query.andWhere('role.id <> :exceptId', { exceptId });
    if (await query.getOne())
      throw new AppError('CONFLICT', '活跃角色名称已存在');
  }
}
