/** Exercises the task repository contract against the real PostgreSQL adapter. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';

import { DEMO_ACTORS } from '../../../identity/domain/demo-actors.js';
import { seedDemoAccounts } from '../../../identity/infrastructure/persistence/seed-demo-accounts.js';
import { Task } from '../../domain/task.js';
import { createPostgresDataSource } from './data-source.js';
import { PostgresTaskQuery } from './postgres-task-query.js';
import { PostgresTaskRepository } from './postgres-task-repository.js';
import { PostgresTaskTransaction } from './postgres-task-transaction.js';
import { seedDemoData } from './seed-demo-data.js';

const DATABASE_URL = process.env.DATABASE_URL_TEST;
const describeDatabase = DATABASE_URL ? describe : describe.skip;

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
      `UPDATE accounts SET name = '已改名用户' WHERE id = 'guild-master'`,
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
});
