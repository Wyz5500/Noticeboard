/** Implements the replaceable demo identity directory with fixed non-secret actors. */
import type { Actor } from '../public/actor.js';
import { DEMO_ACTORS } from '../public/demo-actors.js';
import type { IdentityDirectoryPort } from '../public/identity-directory.port.js';
import type { IdentityAccountPersistence } from '../public/persistence.js';
import type { DataSource } from 'typeorm';

export class DemoIdentityDirectory implements IdentityDirectoryPort {
  /** Accepts the PostgreSQL source while retaining a deterministic unit-test fallback. */
  constructor(
    private readonly dataSource?: DataSource,
    private readonly accounts?: IdentityAccountPersistence,
  ) {}

  /** Lists detached demo actors in the stable UI order. */
  async list(): Promise<Actor[]> {
    if (!this.dataSource || !this.accounts)
      return DEMO_ACTORS.map((actor) => ({ ...actor }));
    const accounts = (await this.accounts.list(this.dataSource.manager)).filter(
      (account) => account.deletedAt === null,
    );
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
    if (!this.dataSource || !this.accounts) {
      const actor = DEMO_ACTORS.find((candidate) => candidate.id === id);
      return actor ? { ...actor } : null;
    }
    const account = await this.accounts.findById(this.dataSource.manager, id);
    return account
      ? account.deletedAt === null
        ? {
            id: account.id,
            name: account.name,
            role: account.roleEntity.code,
            roleLabel: account.roleEntity.name,
            permissions: account.roleEntity.rolePermissions.map(
              (permission) => permission.permissionCode,
            ),
          }
        : null
      : null;
  }
}
