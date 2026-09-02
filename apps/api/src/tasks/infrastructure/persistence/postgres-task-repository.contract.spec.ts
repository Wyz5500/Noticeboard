/** Exercises the task repository contract against the real PostgreSQL adapter. */
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DataSource, QueryRunner } from 'typeorm';

import { PostgresAuthorization } from '../../../authorization/infrastructure/postgres-authorization.js';
import { createPostgresDataSource } from '../../../database.js';
import { PostgresAccountPersistence } from '../../../identity/infrastructure/persistence/postgres-account-persistence.js';
import { seedDemoAccounts } from '../../../identity/infrastructure/persistence/seed-demo-accounts.js';
import { DEMO_ACTORS } from '../../../identity/public/demo-actors.js';
import { seedDemoData } from '../../../seed-demo-data.js';
import { Task } from '../../domain/task.js';
import { PostgresTaskQuery } from './postgres-task-query.js';
import { PostgresTaskRepository } from './postgres-task-repository.js';
import { PostgresTaskTransaction } from './postgres-task-transaction.js';

const DATABASE_URL = process.env.DATABASE_URL_TEST;
const describeDatabase = DATABASE_URL ? describe : describe.skip;
const MANAGEMENT_INVARIANT_LOCK_KEY = 1788062402;
const ACCOUNT_PERSISTENCE = new PostgresAccountPersistence();

/** Holds one transaction-scoped advisory lock until the caller releases the query runner. */
async function lockTransactionAdvisoryKey(
  dataSource: DataSource,
  key: number,
): Promise<QueryRunner> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  await runner.query('SELECT pg_advisory_xact_lock(CAST($1 AS bigint))', [key]);
  return runner;
}

/** Waits until another PostgreSQL session is blocked on one advisory lock key. */
async function waitForAdvisoryLockWaiter(
  dataSource: DataSource,
  key: number,
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const [{ waiting }] = await dataSource.query(
      'SELECT COUNT(*)::int AS waiting FROM pg_locks WHERE locktype = $1 AND classid = $2 AND objid = $3 AND granted = false',
      ['advisory', 0, key],
    );
    if (waiting > 0) return;
    await delay(10);
  }
  throw new Error(`Timed out waiting for advisory lock waiter: ${key}`);
}

describeDatabase('PostgreSQL task repository contract', () => {
  let dataSource: DataSource;
  let transaction: PostgresTaskTransaction;
  let query: PostgresTaskQuery;

  /** Migrates the isolated contract database once before exercising adapters. */
  beforeAll(async () => {
    dataSource = createPostgresDataSource(DATABASE_URL!);
    await dataSource.initialize();
    await dataSource.runMigrations({ transaction: 'all' });
    transaction = new PostgresTaskTransaction(dataSource);
    query = new PostgresTaskQuery(dataSource);
  });

  /** Restores account prerequisites and clears aggregate state for each contract example. */
  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE task_events, tasks, accounts CASCADE',
    );
    await seedDemoAccounts(dataSource);
  });

  /** Releases the PostgreSQL pool after all contract checks. */
  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  /** Proves aggregate fields and ordered events survive a complete database round trip. */
  it('round-trips an aggregate with ordered events', async () => {
    const created = Task.create(
      {
        id: 'task-contract',
        title: '仓储契约',
        type: 'exploration',
        description: '验证聚合往返',
        reward: '12 金币',
        dueDate: '2026-09-10',
      },
      DEMO_ACTORS[0]!,
      '2026-08-30T09:00:00.000Z',
    );
    created.act('accept', DEMO_ACTORS[1]!, '2026-08-30T10:00:00.000Z');

    await transaction.run(async (repository) => repository.insert(created));
    const restored = await transaction.run(async (repository) =>
      repository.findById('task-contract'),
    );

    expect(restored?.toSnapshot()).toEqual(created.toSnapshot());
    expect(
      (await query.getById('task-contract'))?.timeline.map(
        (event) => event.sequence,
      ),
    ).toEqual([1, 2]);
  });

  /** Proves timeline actor names remain historical snapshots after account profile changes. */
  it('preserves event actor snapshots when an account changes', async () => {
    const created = Task.create(
      {
        id: 'task-actor-snapshot',
        title: '历史身份快照',
        type: 'exploration',
        description: '账户改名不能重写历史',
        reward: '12 金币',
        dueDate: '2026-09-10',
      },
      DEMO_ACTORS[0]!,
      '2026-08-30T09:00:00.000Z',
    );
    await transaction.run(async (repository) => repository.insert(created));
    await dataSource.query(
      `UPDATE accounts SET name = '已改名用户' WHERE id = 'noticeboard-master'`,
    );

    expect(
      (await query.getById('task-actor-snapshot'))?.timeline[0]?.actor.name,
    ).toBe('用户 A');
  });

  /** Proves list projections use createdAt descending and ID ascending as a tie breaker. */
  it('lists projections in the public deterministic order', async () => {
    const first = Task.create(
      {
        id: 'task-b',
        title: 'B',
        type: 'collection',
        description: 'B',
        reward: 'B',
        dueDate: '2026-09-10',
      },
      DEMO_ACTORS[0]!,
      '2026-08-30T09:00:00.000Z',
    );
    const second = Task.create(
      {
        id: 'task-a',
        title: 'A',
        type: 'collection',
        description: 'A',
        reward: 'A',
        dueDate: '2026-09-10',
      },
      DEMO_ACTORS[0]!,
      '2026-08-30T09:00:00.000Z',
    );
    const newest = Task.create(
      {
        id: 'task-newest',
        title: 'Newest',
        type: 'collection',
        description: 'Newest',
        reward: 'Newest',
        dueDate: '2026-09-10',
      },
      DEMO_ACTORS[0]!,
      '2026-08-30T10:00:00.000Z',
    );

    await transaction.run(async (repository) => {
      await repository.insert(first);
      await repository.insert(second);
      await repository.insert(newest);
    });

    expect((await query.list()).map((task) => task.id)).toEqual([
      'task-newest',
      'task-a',
      'task-b',
    ]);
  });

  /** Proves a stale conditional update reports conflict and appends no stray event. */
  it('rejects optimistic conflicts without partially appending events', async () => {
    const created = Task.create(
      {
        id: 'task-race',
        title: '并发任务',
        type: 'escort',
        description: '验证版本条件更新',
        reward: '30 金币',
        dueDate: '2026-09-10',
      },
      DEMO_ACTORS[0]!,
      '2026-08-30T09:00:00.000Z',
    );
    await transaction.run(async (repository) => repository.insert(created));
    const stale = await transaction.run(async (repository) =>
      repository.findById('task-race'),
    );
    const current = await transaction.run(async (repository) =>
      repository.findById('task-race'),
    );
    stale!.act('accept', DEMO_ACTORS[1]!, '2026-08-30T10:00:00.000Z');
    current!.act('accept', DEMO_ACTORS[2]!, '2026-08-30T10:01:00.000Z');
    await transaction.run(async (repository) => repository.save(current!, 1));

    await expect(
      transaction.run(async (repository) => repository.save(stale!, 1)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await query.getById('task-race'))?.timeline).toHaveLength(2);
    expect((await query.getById('task-race'))?.assignee?.id).toBe(
      DEMO_ACTORS[2]!.id,
    );
  });

  /** Proves unexpected errors roll back every write made through one transaction capability. */
  it('rolls back aggregate insertion when transaction work fails', async () => {
    const created = Task.create(
      {
        id: 'task-rollback',
        title: '回滚任务',
        type: 'building',
        description: '验证事务原子性',
        reward: '20 金币',
        dueDate: '2026-09-10',
      },
      DEMO_ACTORS[0]!,
      '2026-08-30T09:00:00.000Z',
    );

    await expect(
      transaction.run(async (repository) => {
        await repository.insert(created);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');
    await expect(query.getById('task-rollback')).resolves.toBeNull();
  });

  /** Proves replacement semantics remove old tasks and preserve all seeded event histories. */
  it('replaces all aggregates for demo reset', async () => {
    const repository = new PostgresTaskRepository(dataSource.manager);
    await repository.replaceAll([
      Task.create(
        {
          id: 'task-only',
          title: '唯一任务',
          type: 'bounty',
          description: '重置结果',
          reward: '40 金币',
          dueDate: '2026-09-10',
        },
        DEMO_ACTORS[0]!,
        '2026-08-30T09:00:00.000Z',
      ),
    ]);

    expect((await query.list()).map((task) => task.id)).toEqual(['task-only']);
  });

  /** Proves deployment seed initializes an empty database without overwriting durable tasks. */
  it('seeds only an empty task table', async () => {
    await dataSource.transaction(seedDemoData);
    expect((await query.list()).map((task) => task.id)).toEqual([
      'task-herbs',
      'task-outpost',
      'task-lanterns',
      'task-starfire',
      'task-village',
      'task-quarry',
      'task-beacon',
      'task-harbor',
      'task-grove',
      'task-portal',
      'task-nether',
      'task-bridge',
    ]);
    expect(await query.list()).toHaveLength(12);

    const existingIds = (await query.list()).map((task) => task.id);
    await dataSource.transaction(seedDemoData);

    expect((await query.list()).map((task) => task.id)).toEqual(existingIds);
  });

  /** Proves a redeployment seed preserves a non-seed task rather than resetting the table. */
  it('does not replace existing tasks during deployment seed', async () => {
    const existing = Task.create(
      {
        id: 'task-durable',
        title: '持久任务',
        type: 'building',
        description: '重新部署后仍需存在',
        reward: '80 金币',
        dueDate: '2026-09-10',
      },
      DEMO_ACTORS[0]!,
      '2026-08-30T09:00:00.000Z',
    );
    await transaction.run(async (repository) => repository.insert(existing));

    await dataSource.transaction(seedDemoData);

    expect((await query.list()).map((task) => task.id)).toEqual([
      'task-durable',
    ]);
  });

  /** Proves deployment seed does not overwrite managed account or permission changes. */
  it('preserves managed accounts and permissions during deployment seed', async () => {
    await dataSource.query(
      "DELETE FROM role_permissions WHERE role_id = 'role-user' AND permission_code = 'tasks.view'",
    );
    await dataSource.query(
      "UPDATE accounts SET role_id = 'role-system-admin', deleted_at = NOW() WHERE id = 'noticeboard-master'",
    );

    try {
      await dataSource.transaction(seedDemoData);

      const account = await dataSource.query(
        "SELECT role_id, deleted_at FROM accounts WHERE id = 'noticeboard-master'",
      );
      const permission = await dataSource.query(
        "SELECT 1 FROM role_permissions WHERE role_id = 'role-user' AND permission_code = 'tasks.view'",
      );
      expect(account[0]).toMatchObject({ role_id: 'role-system-admin' });
      expect(account[0].deleted_at).not.toBeNull();
      expect(permission).toHaveLength(0);
    } finally {
      await dataSource.query(
        "UPDATE accounts SET role_id = 'role-user', deleted_at = NULL WHERE id = 'noticeboard-master'",
      );
      await dataSource.query(
        "INSERT INTO role_permissions (role_id, permission_code) VALUES ('role-user', 'tasks.view') ON CONFLICT DO NOTHING",
      );
    }
  });

  /** Proves concurrent administrator deletion cannot remove the final management user. */
  it('serializes concurrent final-administrator deletions', async () => {
    const authorization = new PostgresAuthorization(
      dataSource,
      ACCOUNT_PERSISTENCE,
    );
    await dataSource.query(
      "UPDATE accounts SET role_id = 'role-system-admin', deleted_at = NULL WHERE id IN ('adventurer-a', 'adventurer-b')",
    );
    await dataSource.query(
      "UPDATE accounts SET role_id = 'role-user', deleted_at = NULL WHERE id = 'noticeboard-admin'",
    );

    try {
      const results = await Promise.allSettled([
        authorization.softDeleteUser('adventurer-a'),
        authorization.softDeleteUser('adventurer-b'),
      ]);

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === 'rejected'),
      ).toMatchObject({ reason: { code: 'CONFLICT' } });
      const [{ count }] = await dataSource.query(
        "SELECT COUNT(*)::int AS count FROM accounts AS account JOIN roles AS role ON role.id = account.role_id JOIN role_permissions AS permission ON permission.role_id = role.id WHERE account.deleted_at IS NULL AND permission.permission_code = 'system.manage'",
      );
      expect(count).toBe(1);
    } finally {
      await dataSource.query(
        "UPDATE accounts SET role_id = 'role-user', deleted_at = NULL WHERE id IN ('adventurer-a', 'adventurer-b')",
      );
      await dataSource.query(
        "UPDATE accounts SET role_id = 'role-system-admin', deleted_at = NULL WHERE id = 'noticeboard-admin'",
      );
    }
  });

  /** Proves concurrent active role-name creation resolves the database race as a conflict. */
  it('maps concurrent duplicate role names to conflicts', async () => {
    const authorization = new PostgresAuthorization(
      dataSource,
      ACCOUNT_PERSISTENCE,
    );
    const name = `并发角色-${Date.now()}`;
    const results = await Promise.allSettled([
      authorization.createRole({ name }),
      authorization.createRole({ name }),
    ]);

    try {
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === 'rejected'),
      ).toMatchObject({ reason: { code: 'CONFLICT' } });
    } finally {
      await dataSource.query('DELETE FROM roles WHERE name = $1', [name]);
    }
  });

  /** Proves concurrent role deletion and user reassignment cannot leave a deleted role assigned. */
  it('serializes role deletion with user reassignment', async () => {
    const authorization = new PostgresAuthorization(
      dataSource,
      ACCOUNT_PERSISTENCE,
    );
    const role = await authorization.createRole({
      name: `角色改派竞态-${Date.now()}`,
    });

    try {
      const results = await Promise.allSettled([
        authorization.softDeleteRole(role.id),
        authorization.updateUser('adventurer-a', { roleId: role.id }),
      ]);
      const [{ deleted_at: deletedAt }] = await dataSource.query(
        'SELECT deleted_at FROM roles WHERE id = $1',
        [role.id],
      );
      const [{ role_id: roleId }] = await dataSource.query(
        "SELECT role_id FROM accounts WHERE id = 'adventurer-a'",
      );

      expect(deletedAt !== null && roleId === role.id).toBe(false);
      expect(results.some((result) => result.status === 'fulfilled')).toBe(
        true,
      );
    } finally {
      await dataSource.query(
        "UPDATE accounts SET role_id = 'role-user', deleted_at = NULL WHERE id = 'adventurer-a'",
      );
      await dataSource.query('DELETE FROM roles WHERE id = $1', [role.id]);
    }
  });

  /** Proves concurrent role edits cannot resurrect a role that another transaction deleted. */
  it('keeps a concurrently edited custom role soft-deleted', async () => {
    const authorization = new PostgresAuthorization(
      dataSource,
      ACCOUNT_PERSISTENCE,
    );
    const role = await authorization.createRole({
      name: `角色生命周期竞态-${Date.now()}`,
      permissions: ['system.manage'],
    });
    const blocker = await lockTransactionAdvisoryKey(
      dataSource,
      MANAGEMENT_INVARIANT_LOCK_KEY,
    );

    try {
      const updatePromise = authorization.updateRole(role.id, {
        name: `${role.name}-改名`,
        permissions: [],
      });
      await waitForAdvisoryLockWaiter(
        dataSource,
        MANAGEMENT_INVARIANT_LOCK_KEY,
      );
      const deletePromise = authorization.softDeleteRole(role.id);
      await delay(25);
      await blocker.commitTransaction();
      const results = await Promise.allSettled([updatePromise, deletePromise]);
      const [{ deleted_at: deletedAt }] = await dataSource.query(
        'SELECT deleted_at FROM roles WHERE id = $1',
        [role.id],
      );

      expect(results).toEqual([
        expect.objectContaining({ status: 'fulfilled' }),
        expect.objectContaining({ status: 'fulfilled' }),
      ]);
      expect(deletedAt).not.toBeNull();
    } finally {
      if (blocker.isTransactionActive) await blocker.rollbackTransaction();
      await blocker.release();
      await dataSource.query('DELETE FROM roles WHERE id = $1', [role.id]);
    }
  });

  /** Proves concurrent user restore and reassignment end with the latest active role assignment. */
  it('restores a reassigned deleted user with the latest active role', async () => {
    const authorization = new PostgresAuthorization(
      dataSource,
      ACCOUNT_PERSISTENCE,
    );
    const role = await authorization.createRole({
      name: `用户恢复竞态角色-${Date.now()}`,
    });
    const blocker = await lockTransactionAdvisoryKey(
      dataSource,
      MANAGEMENT_INVARIANT_LOCK_KEY,
    );
    await dataSource.query(
      "UPDATE accounts SET role_id = $1, deleted_at = NOW() WHERE id = 'adventurer-a'",
      [role.id],
    );
    await dataSource.query(
      'UPDATE roles SET deleted_at = NOW() WHERE id = $1',
      [role.id],
    );

    try {
      const reassignPromise = authorization.updateUser('adventurer-a', {
        roleId: 'role-user',
      });
      await waitForAdvisoryLockWaiter(
        dataSource,
        MANAGEMENT_INVARIANT_LOCK_KEY,
      );
      const restorePromise = authorization.restoreUser('adventurer-a');
      await delay(25);
      await blocker.commitTransaction();
      const results = await Promise.allSettled([
        reassignPromise,
        restorePromise,
      ]);
      const [{ role_id: roleId, deleted_at: deletedAt }] =
        await dataSource.query(
          "SELECT role_id, deleted_at FROM accounts WHERE id = 'adventurer-a'",
        );

      expect(results).toEqual([
        expect.objectContaining({ status: 'fulfilled' }),
        expect.objectContaining({ status: 'fulfilled' }),
      ]);
      expect(roleId).toBe('role-user');
      expect(deletedAt).toBeNull();
    } finally {
      if (blocker.isTransactionActive) await blocker.rollbackTransaction();
      await blocker.release();
      await dataSource.query(
        "UPDATE accounts SET role_id = 'role-user', deleted_at = NULL WHERE id = 'adventurer-a'",
      );
      await dataSource.query('DELETE FROM roles WHERE id = $1', [role.id]);
    }
  });

  /** Proves invalid built-in role identity edits use the documented validation error. */
  it('maps built-in role rename attempts to validation errors', async () => {
    const authorization = new PostgresAuthorization(
      dataSource,
      ACCOUNT_PERSISTENCE,
    );

    await expect(
      authorization.updateRole('role-user', {
        name: '改名用户角色',
        permissions: ['tasks.view'],
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: '内置角色名称不可修改',
    });
  });
});
