/** Exercises the task repository contract against the real PostgreSQL adapter. */
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DataSource, QueryRunner } from 'typeorm';

import { PostgresAuthorization } from '../../../authorization/infrastructure/postgres-authorization.js';
import { AddTaskRenewedEvent1788062404000 } from '../../../common/infrastructure/database/migrations/1788062404000-add-task-renewed-event.js';
import { AddTimelineComments1788062405000 } from '../../../common/infrastructure/database/migrations/1788062405000-add-timeline-comments.js';
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
    created.act(
      'accept',
      DEMO_ACTORS[1]!,
      '2026-08-30T10:00:00.000Z',
      '2026-08-30',
    );

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

  /** Proves expired-task renewal persists its new deadline, workflow, and event atomically. */
  it('round-trips one renewed expired task', async () => {
    const created = Task.create(
      {
        id: 'task-renewed-contract',
        title: '续期仓储契约',
        type: 'exploration',
        description: '验证续期聚合往返',
        reward: '12 金币',
        dueDate: '2026-09-01',
      },
      DEMO_ACTORS[0]!,
      '2026-08-30T09:00:00.000Z',
    );
    created.act(
      'accept',
      DEMO_ACTORS[1]!,
      '2026-08-30T10:00:00.000Z',
      '2026-08-30',
    );
    await transaction.run(async (repository) => repository.insert(created));
    const loaded = await transaction.run(async (repository) =>
      repository.findById('task-renewed-contract'),
    );

    loaded!.renewExpired(DEMO_ACTORS[0]!, {
      dueDate: '2026-09-03',
      recoveryStrategy: 'reopened',
      currentDate: '2026-09-02',
      at: '2026-09-02T04:00:00.000Z',
    });
    await transaction.run(async (repository) => repository.save(loaded!, 2));

    await expect(query.getById('task-renewed-contract')).resolves.toMatchObject(
      {
        dueDate: '2026-09-03',
        status: 'reopened',
        assignee: null,
        version: 3,
        timeline: [{}, {}, { action: 'renewed', actor: DEMO_ACTORS[0] }],
      },
    );
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

  /** Proves raw comments round-trip while public reads replace deleted content in place. */
  it('persists comment events and projects deletion tombstones without exposing delete events', async () => {
    const task = Task.create(
      {
        id: 'task-comment-contract',
        title: '评论仓储契约',
        type: 'exploration',
        description: '验证评论事件与公开投影',
        reward: '12 金币',
        dueDate: '2026-09-10',
      },
      DEMO_ACTORS[0]!,
      '2026-08-30T09:00:00.000Z',
    );
    task.addComment(
      'comment-contract',
      '数据库必须保留正文',
      DEMO_ACTORS[1]!,
      '2026-08-30T10:00:00.000Z',
    );
    task.deleteComment(
      'comment-contract',
      DEMO_ACTORS[1]!,
      false,
      '2026-08-30T11:00:00.000Z',
    );

    await transaction.run(async (repository) => repository.insert(task));

    expect(
      (
        await transaction.run(async (repository) =>
          repository.findById('task-comment-contract'),
        )
      )?.toSnapshot(),
    ).toEqual(task.toSnapshot());
    expect((await query.getById('task-comment-contract'))?.timeline).toEqual([
      expect.objectContaining({ kind: 'activity', action: 'created' }),
      expect.objectContaining({
        kind: 'comment',
        commentId: 'comment-contract',
        content: null,
        deleted: true,
        deletedAt: '2026-08-30T11:00:00.000Z',
        deletedByUsername: 'adventurer-a',
      }),
    ]);
    const raw = await dataSource.query(
      "SELECT action, content FROM task_events WHERE task_id = 'task-comment-contract' ORDER BY sequence",
    );
    expect(raw).toEqual([
      { action: 'created', content: null },
      { action: 'comment_created', content: '数据库必须保留正文' },
      { action: 'comment_deleted', content: null },
    ]);
  });

  /** Proves seeded and administrator-created accounts receive server-derived usernames. */
  it('derives unique account usernames directly from stable account IDs', async () => {
    const seeded = await dataSource.query(
      'SELECT id, username FROM accounts ORDER BY id',
    );
    expect(
      seeded.every(
        (account: { id: string; username: string }) =>
          account.username === account.id,
      ),
    ).toBe(true);

    const authorization = new PostgresAuthorization(
      dataSource,
      ACCOUNT_PERSISTENCE,
    );
    const created = await authorization.createUser({
      name: '用户名契约用户',
      roleId: 'role-user',
    });
    expect(created.username).toBe(created.id);
    await expect(
      dataSource.query(
        "INSERT INTO accounts (id, username, name, role_id) VALUES ('duplicate-username', $1, '重复用户名', 'role-user')",
        [created.username],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  /** Proves event username snapshots survive later account identity changes. */
  it('preserves event actor usernames when an account username changes', async () => {
    const task = Task.create(
      {
        id: 'task-username-snapshot',
        title: '用户名快照',
        type: 'exploration',
        description: '账户用户名变化不能重写历史',
        reward: '12 金币',
        dueDate: '2026-09-10',
      },
      DEMO_ACTORS[0]!,
      '2026-08-30T09:00:00.000Z',
    );
    await transaction.run(async (repository) => repository.insert(task));
    await dataSource.query(
      "UPDATE accounts SET username = 'renamed-master' WHERE id = 'noticeboard-master'",
    );

    try {
      expect(
        (await query.getById('task-username-snapshot'))?.timeline[0]?.actor
          .username,
      ).toBe('noticeboard-master');
    } finally {
      await dataSource.query(
        "UPDATE accounts SET username = 'noticeboard-master' WHERE id = 'noticeboard-master'",
      );
    }
  });

  /** Proves upgraded databases accept writes from an old API process during a rolling release. */
  it('derives new mandatory snapshots for legacy inserts after the comment migration', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      const migration = new AddTimelineComments1788062405000();
      await migration.down(runner);
      await migration.up(runner);
      await runner.query(
        "INSERT INTO accounts (id, name, role_id) VALUES ('legacy-writer', '旧版写入者', 'role-user')",
      );
      await runner.query(`
        INSERT INTO tasks (
          id, title, type, description, reward, due_date, publisher_id,
          status, created_at, updated_at, version
        ) VALUES (
          'task-legacy-writer', '滚动升级', 'exploration', '旧进程仍可写入',
          '12 金币', '2026-09-10', 'legacy-writer', 'not_started',
          '2026-08-30T09:00:00.000Z', '2026-08-30T09:00:00.000Z', 1
        )
      `);
      await runner.query(`
        INSERT INTO task_events (
          task_id, sequence, action, actor_id, at, detail,
          actor_name, actor_role, actor_role_name
        ) VALUES (
          'task-legacy-writer', 1, 'created', 'legacy-writer',
          '2026-08-30T09:00:00.000Z', '', '旧版写入者', 'user', '用户'
        )
      `);

      await expect(
        runner.query(
          "SELECT id, username FROM accounts WHERE id = 'legacy-writer'",
        ),
      ).resolves.toEqual([{ id: 'legacy-writer', username: 'legacy-writer' }]);
      await expect(
        runner.query(
          "SELECT actor_id, actor_username FROM task_events WHERE task_id = 'task-legacy-writer'",
        ),
      ).resolves.toEqual([
        { actor_id: 'legacy-writer', actor_username: 'legacy-writer' },
      ]);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  /** Proves the earlier renewed migration preserves retained comment rows while widening the action constraint. */
  it('applies the renewed migration to an existing comment schema with comment rows', async () => {
    const task = Task.create(
      {
        id: 'task-retained-comment-migration',
        title: '保留评论迁移',
        type: 'exploration',
        description: '验证续期迁移兼容已有评论行',
        reward: '12 金币',
        dueDate: '2026-09-10',
      },
      DEMO_ACTORS[0]!,
      '2026-08-30T09:00:00.000Z',
    );
    task.addComment(
      'comment-retained-migration',
      '迁移前已有评论',
      DEMO_ACTORS[1]!,
      '2026-08-30T10:00:00.000Z',
    );
    await transaction.run(async (repository) => repository.insert(task));
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      await runner.query(
        'ALTER TABLE task_events DROP CONSTRAINT task_events_comment_payload_check, DROP CONSTRAINT task_events_action_check',
      );
      await runner.query(
        "ALTER TABLE task_events ADD CONSTRAINT task_events_action_check CHECK (action IN ('created', 'accepted', 'completed', 'approved', 'reopened', 'closed', 'comment_created', 'comment_deleted'))",
      );
      await runner.query(`
        ALTER TABLE task_events
        ADD CONSTRAINT task_events_comment_payload_check CHECK (
          (
            action = 'comment_created'
            AND comment_id IS NOT NULL
            AND btrim(comment_id) <> ''
            AND content IS NOT NULL
            AND btrim(content) <> ''
            AND char_length(content) <= 1000
            AND target_comment_id IS NULL
          )
          OR (
            action = 'comment_deleted'
            AND comment_id IS NULL
            AND content IS NULL
            AND target_comment_id IS NOT NULL
            AND btrim(target_comment_id) <> ''
          )
          OR (
            action IN ('created', 'accepted', 'completed', 'approved', 'reopened', 'closed')
            AND comment_id IS NULL
            AND content IS NULL
            AND target_comment_id IS NULL
          )
        )
      `);
      await new AddTaskRenewedEvent1788062404000().up(runner);
      await runner.query(`
        INSERT INTO task_events (
          task_id, sequence, action, actor_id, actor_username, at, detail,
          actor_name, actor_role, actor_role_name
        ) VALUES (
          'task-retained-comment-migration', 3, 'renewed',
          'noticeboard-master', 'noticeboard-master',
          '2026-08-30T11:00:00.000Z', '', '用户 A', 'user', '用户'
        )
      `);
      const [{ definition }] = await runner.query(`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conname = 'task_events_action_check'
      `);
      const normalized = String(definition).toLowerCase();

      expect(normalized).toContain("'renewed'::character varying");
      expect(normalized).toContain("'comment_created'::character varying");
      expect(normalized).toContain("'comment_deleted'::character varying");
      await expect(
        runner.query(
          "SELECT action FROM task_events WHERE task_id = 'task-retained-comment-migration' ORDER BY sequence",
        ),
      ).resolves.toEqual([
        { action: 'created' },
        { action: 'comment_created' },
        { action: 'renewed' },
      ]);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  /** Proves a retained worktree database can reconcile the pre-merge comment schema with renewed events. */
  it('reconciles the renewed action when the comment schema already exists', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      await new AddTimelineComments1788062405000().up(runner);
      const [{ definition }] = await runner.query(`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conname = 'task_events_action_check'
      `);
      const normalized = String(definition).toLowerCase();

      expect(normalized).toContain("'renewed'::character varying");
      expect(normalized).toContain("'comment_created'::character varying");
      expect(normalized).toContain("'comment_deleted'::character varying");
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  /** Proves the database constraint independently rejects blank or over-limit comment payloads. */
  it('installs the complete comment event payload shape check', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      const migration = new AddTimelineComments1788062405000();
      await migration.down(runner);
      await migration.up(runner);
      const [{ definition }] = await runner.query(`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conname = 'task_events_comment_payload_check'
      `);
      const normalized = String(definition).toLowerCase();

      expect(normalized).toContain("btrim((comment_id)::text) <> ''::text");
      expect(normalized).toContain(
        "btrim((target_comment_id)::text) <> ''::text",
      );
      expect(normalized).toContain("btrim((content)::text) <> ''::text");
      expect(normalized).toContain('char_length((content)::text) <= 1000');
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  /** Proves the database prevents more than one deletion marker for the same comment. */
  it('installs a unique deleted-comment marker index', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      const migration = new AddTimelineComments1788062405000();
      await migration.down(runner);
      await migration.up(runner);
      const indexes = await runner.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'task_events'
          AND indexname = 'task_events_deleted_comment_idx'
      `);

      expect(indexes).toEqual([
        { indexname: 'task_events_deleted_comment_idx' },
      ]);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  /** Proves the migration bounds table-lock and backfill statements within its transaction. */
  it('sets a transaction-local statement timeout while applying the comment migration', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      const migration = new AddTimelineComments1788062405000();
      await migration.down(runner);
      await migration.up(runner);
      const [{ statement_timeout: timeout }] = await runner.query(
        'SHOW statement_timeout',
      );
      expect(timeout).toBe('30s');
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  /** Proves rollback removes comment rows before restoring lifecycle-only constraints. */
  it('reverts the comment migration transactionally when comment events exist', async () => {
    const task = Task.create(
      {
        id: 'task-comment-revert',
        title: '评论迁移回滚',
        type: 'exploration',
        description: '验证已有评论不会阻止迁移回滚',
        reward: '12 金币',
        dueDate: '2026-09-10',
      },
      DEMO_ACTORS[0]!,
      '2026-08-30T09:00:00.000Z',
    );
    task.addComment(
      'comment-revert',
      '回滚前评论',
      DEMO_ACTORS[1]!,
      '2026-08-30T10:00:00.000Z',
    );
    await transaction.run(async (repository) => repository.insert(task));
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      await new AddTimelineComments1788062405000().down(runner);
      const events = await runner.query(
        "SELECT action FROM task_events WHERE task_id = 'task-comment-revert' ORDER BY sequence",
      );
      expect(events).toEqual([{ action: 'created' }]);
      const [{ count }] = await runner.query(
        "SELECT COUNT(*)::int AS count FROM information_schema.columns WHERE table_name = 'accounts' AND column_name = 'username'",
      );
      expect(count).toBe(0);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
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
    stale!.act(
      'accept',
      DEMO_ACTORS[1]!,
      '2026-08-30T10:00:00.000Z',
      '2026-08-30',
    );
    current!.act(
      'accept',
      DEMO_ACTORS[2]!,
      '2026-08-30T10:01:00.000Z',
      '2026-08-30',
    );
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
