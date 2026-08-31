/** Implements the replaceable demo identity directory with fixed non-secret actors. */
import type { IdentityDirectoryPort } from '../application/ports/identity-directory.port.js';
import { DEMO_ACTORS } from '../domain/demo-actors.js';
import type { Actor } from '../../tasks/domain/task.types.js';
import { IsNull, type DataSource } from 'typeorm';
import { AccountOrmEntity } from './persistence/entities/account.orm-entity.js';

export class DemoIdentityDirectory implements IdentityDirectoryPort {
  /** Accepts the PostgreSQL source while retaining a deterministic unit-test fallback. */
  constructor(private readonly dataSource?: DataSource) {}

  /** Lists detached demo actors in the stable UI order. */
  async list(): Promise<Actor[]> {
    if (!this.dataSource) return DEMO_ACTORS.map((actor) => ({ ...actor }));
    const accounts = await this.dataSource
      .getRepository(AccountOrmEntity)
      .find({
        where: { deletedAt: IsNull() },
        relations: { roleEntity: { rolePermissions: true } },
        order: { id: 'ASC' },
      });
    const preferredOrder = [
      'noticeboard-master',
      'adventurer-a',
      'adventurer-b',
      'noticeboard-admin',
    ];
    accounts.sort(
      (left, right) =>
        (preferredOrder.indexOf(left.id) + 1 || preferredOrder.length + 1) -
          (preferredOrder.indexOf(right.id) + 1 || preferredOrder.length + 1) ||
        left.id.localeCompare(right.id),
    );
    return accounts.map((account) => ({
      id: account.id,
      name: account.name,
      role: account.roleEntity.code,
      roleLabel: account.roleEntity.name,
      permissions: account.roleEntity.rolePermissions.map(
        (permission) => permission.permissionCode,
      ),
    }));
  }

  /** Resolves an exact demo actor without selecting a fallback. */
  async findById(id: string): Promise<Actor | null> {
    if (!this.dataSource) {
      const actor = DEMO_ACTORS.find((candidate) => candidate.id === id);
      return actor ? { ...actor } : null;
    }
    const account = await this.dataSource
      .getRepository(AccountOrmEntity)
      .findOne({
        where: { id, deletedAt: IsNull() },
        relations: { roleEntity: { rolePermissions: true } },
      });
    return account
      ? {
          id: account.id,
          name: account.name,
          role: account.roleEntity.code,
          roleLabel: account.roleEntity.name,
          permissions: account.roleEntity.rolePermissions.map(
            (permission) => permission.permissionCode,
          ),
        }
      : null;
  }
}
