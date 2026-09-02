/** Verifies identity directory projections preserve stable server-derived usernames. */
import { describe, expect, it } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';

import type {
  IdentityAccountPersistence,
  IdentityAccountPersistenceRecord,
} from '../public/persistence.js';
import { DemoIdentityDirectory } from './demo-identity-directory.js';

const ACCOUNT: IdentityAccountPersistenceRecord = {
  id: 'stable-account',
  username: 'stable-account',
  name: '稳定用户',
  roleId: 'role-user',
  roleEntity: {
    id: 'role-user',
    code: 'user',
    name: '用户',
    builtin: true,
    deletedAt: null,
    updatedAt: new Date('2026-09-01T09:00:00.000Z'),
    rolePermissions: [{ roleId: 'role-user', permissionCode: 'tasks.view' }],
  },
  deletedAt: null,
  updatedAt: new Date('2026-09-01T09:00:00.000Z'),
};

/** Supplies detached account records without exercising TypeORM in this unit test. */
class MemoryAccounts implements IdentityAccountPersistence {
  /** Returns the configured active account. */
  list(): Promise<IdentityAccountPersistenceRecord[]> {
    return Promise.resolve([ACCOUNT]);
  }

  /** Finds the configured account by its stable identifier. */
  findById(
    _manager: EntityManager,
    id: string,
  ): Promise<IdentityAccountPersistenceRecord | null> {
    return Promise.resolve(id === ACCOUNT.id ? ACCOUNT : null);
  }

  /** Finds the configured active account by its stable identifier. */
  findActiveById(
    manager: EntityManager,
    id: string,
  ): Promise<IdentityAccountPersistenceRecord | null> {
    return this.findById(manager, id);
  }

  /** Creates are outside this read-directory test. */
  create(): Promise<IdentityAccountPersistenceRecord> {
    return Promise.reject(new Error('not used'));
  }

  /** Saves are outside this read-directory test. */
  save(): Promise<IdentityAccountPersistenceRecord> {
    return Promise.reject(new Error('not used'));
  }

  /** Management counts are outside this read-directory test. */
  countActiveManagementUsers(): Promise<number> {
    return Promise.resolve(0);
  }

  /** Role counts are outside this read-directory test. */
  countActiveForRole(): Promise<number> {
    return Promise.resolve(0);
  }

  /** Historical role counts are outside this read-directory test. */
  countForRole(): Promise<number> {
    return Promise.resolve(0);
  }
}

describe('DemoIdentityDirectory', () => {
  /** Proves the non-database fallback exposes the same stable usernames as PostgreSQL. */
  it('returns stable usernames from the deterministic fallback directory', async () => {
    await expect(new DemoIdentityDirectory().list()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'noticeboard-master',
          username: 'noticeboard-master',
        }),
      ]),
    );
  });

  /** Proves database-backed list and lookup projections retain persisted usernames. */
  it('carries persisted usernames through list and exact lookup projections', async () => {
    const dataSource = { manager: {} } as DataSource;
    const directory = new DemoIdentityDirectory(
      dataSource,
      new MemoryAccounts(),
    );

    await expect(directory.list()).resolves.toEqual([
      expect.objectContaining({
        id: 'stable-account',
        username: 'stable-account',
      }),
    ]);
    await expect(directory.findById('stable-account')).resolves.toMatchObject({
      id: 'stable-account',
      username: 'stable-account',
    });
  });
});
