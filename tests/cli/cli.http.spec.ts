/** Exercises built CLI subprocesses through a real host API and isolated verification PostgreSQL. */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module.js';
import { configureHttpApplication } from '../../apps/api/src/common/presentation/configure-http-application.js';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl)
  throw new Error('DATABASE_URL_TEST is required for CLI HTTP smoke');
const execute = promisify(execFile);
let directory: string;
let app: NestFastifyApplication | undefined;
let baseUrl: string;

/** Builds an independent executable and starts only a loopback host API on a dynamic port. */
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'noticeboard-cli-http-'));
  await execute(process.execPath, [
    'scripts/build-cli.mjs',
    '--out-dir',
    join(directory, 'package'),
  ]);
  process.env.DATABASE_URL = databaseUrl;
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ logger: false }),
  );
  configureHttpApplication(app);
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

/** Releases the listening process resources and test-owned package/config files. */
afterAll(async () => {
  await app?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

/** Uses asynchronous child execution so the parent can continue serving real HTTP requests. */
async function cli(args: string[], stdin?: string) {
  const command = [
    join(directory, 'package/bin/noticeboard.js'),
    ...args,
    '--base-url',
    baseUrl,
    '--json',
  ];
  const options = {
    env: {
      ...process.env,
      NOTICEBOARD_CONFIG_FILE: join(directory, 'config.json'),
      NOTICEBOARD_PROFILE: 'local',
      NOTICEBOARD_USER: 'noticeboard-master',
    },
  };
  try {
    const pending = execute(process.execPath, command, options);
    if (stdin !== undefined) pending.child.stdin?.end(stdin);
    return {
      ...(await pending),
      exitCode: 0,
    };
  } catch (cause) {
    const error = cause as Error & {
      code: number;
      stdout: string;
      stderr: string;
    };
    return { stdout: error.stdout, stderr: error.stderr, exitCode: error.code };
  }
}

/** Installed-style commands must project real management data and retain server permission failures. */
it('reads management collections and rejects non-management identities', async () => {
  const result = await cli([
    'admin',
    'overview',
    '--user',
    'noticeboard-admin',
  ]);
  expect(result.exitCode, result.stderr).toBe(0);
  const overview = JSON.parse(result.stdout).data as {
    users: unknown[];
    roles: unknown[];
    permissions: unknown[];
  };
  expect(overview.users).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'noticeboard-admin' }),
    ]),
  );
  expect(overview.permissions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'system.manage' }),
    ]),
  );
  for (const [resource, expected] of [
    ['user', overview.users],
    ['role', overview.roles],
    ['permission', overview.permissions],
  ] as const) {
    const list = await cli([resource, 'list', '--user', 'noticeboard-admin']);
    expect(list.exitCode, list.stderr).toBe(0);
    expect(list.stderr).toBe('');
    expect(JSON.parse(list.stdout)).toEqual({ data: expected });
  }
  for (const [user, status] of [
    ['noticeboard-master', 403],
    ['cli-missing-admin', 401],
  ] as const) {
    const denied = await cli(['user', 'list', '--user', user]);
    expect(denied.exitCode).toBe(77);
    expect(denied.stdout).toBe('');
    expect(JSON.parse(denied.stderr)).toMatchObject({
      error: { kind: 'api', status, path: '/api/v1/admin/overview' },
      meta: { exitCode: 77 },
    });
  }
});

/** Details and local filters must agree with the real overview without adding HTTP endpoints. */
it('reads management details and combines filters through the built CLI', async () => {
  const admin = ['--user', 'noticeboard-admin'];
  const detail = await cli(['user', 'get', 'noticeboard-admin', ...admin]);
  expect(detail.exitCode, detail.stderr).toBe(0);
  const user = JSON.parse(detail.stdout).data as {
    id: string;
    username: string;
    roleId: string;
  };
  expect(user.id).toBe('noticeboard-admin');
  const filtered = await cli([
    'user',
    'list',
    '--search',
    user.username.toUpperCase(),
    '--active',
    'true',
    '--deleted',
    'false',
    ...admin,
  ]);
  expect(filtered.exitCode, filtered.stderr).toBe(0);
  expect(JSON.parse(filtered.stdout)).toEqual({ data: [user] });
  const role = await cli(['role', 'get', user.roleId, ...admin]);
  expect(role.exitCode, role.stderr).toBe(0);
  expect(JSON.parse(role.stdout).data.id).toBe(user.roleId);
  const permission = await cli([
    'permission',
    'get',
    'system.manage',
    ...admin,
  ]);
  expect(permission.exitCode, permission.stderr).toBe(0);
  const permissions = await cli([
    'permission',
    'list',
    '--search',
    'SYSTEM.MANAGE',
    ...admin,
  ]);
  expect(permissions.exitCode, permissions.stderr).toBe(0);
  expect(JSON.parse(permissions.stdout)).toEqual({
    data: [JSON.parse(permission.stdout).data],
  });
  const empty = await cli([
    'role',
    'list',
    '--search',
    'cli-no-such-role-9238',
    ...admin,
  ]);
  expect(empty.exitCode, empty.stderr).toBe(0);
  expect(JSON.parse(empty.stdout)).toEqual({ data: [] });
  const missing = await cli(['user', 'get', 'cli-no-such-user-9238', ...admin]);
  expect(missing.exitCode).toBe(66);
  expect(missing.stdout).toBe('');
  expect(JSON.parse(missing.stderr).error).toEqual({
    kind: 'usage',
    message: expect.any(String),
  });
  const denied = await cli([
    'permission',
    'get',
    'system.manage',
    '--user',
    'noticeboard-master',
  ]);
  expect(denied.exitCode).toBe(77);
  expect(denied.stdout).toBe('');
  expect(JSON.parse(denied.stderr).error.status).toBe(403);
});

/** Verifies all read resources and configuration identity selection through the bundled public client. */
it('reads real identities, task lists and details', async () => {
  const identities = await cli(['identity', 'list']);
  expect(identities.exitCode, identities.stderr).toBe(0);
  expect(JSON.parse(identities.stdout).data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'noticeboard-master' }),
    ]),
  );
  expect((await cli(['identity', 'use', 'noticeboard-master'])).exitCode).toBe(
    0,
  );
  const tasks = await cli(['task', 'list']);
  expect(tasks.exitCode, tasks.stderr).toBe(0);
  // Compare a stable seed rather than a task left by another smoke suite.
  const first = (
    JSON.parse(tasks.stdout).data as { id: string; version: number }[]
  ).find((task) => task.id === 'task-herbs')!;
  expect(first).toBeDefined();
  const detail = await cli(['task', 'get', first.id]);
  expect(detail.exitCode, detail.stderr).toBe(0);
  expect(JSON.parse(detail.stdout).data).toMatchObject({
    id: first.id,
    version: first.version,
  });
});

/** Server errors must reach shell status and stderr without contaminating stdout. */
it('reports real missing resources and invalid identities', async () => {
  const missing = await cli(['task', 'get', 'cli-missing-task']);
  expect(missing.exitCode).toBe(66);
  expect(missing.stdout).toBe('');
  expect(JSON.parse(missing.stderr)).toMatchObject({
    error: { kind: 'api', status: 404 },
    meta: { exitCode: 66 },
  });
  const invalid = await cli(['task', 'list', '--user', 'cli-missing-user']);
  expect(invalid.exitCode).toBe(77);
  expect(JSON.parse(invalid.stderr).error).toMatchObject({
    kind: 'api',
    status: 401,
  });
});

/** Verifies the built command surface, real concurrency failures and durable comment deletion. */
it('writes tasks and comments through the installed-style executable', async () => {
  const created = await cli(
    [
      'task',
      'create',
      '--title',
      'CLI 写入验证',
      '--type',
      'exploration',
      '--reward',
      '测试',
      '--due-date',
      '2026-08-31',
      '--description-file',
      '-',
    ],
    'CLI 独立任务\n来自 stdin',
  );
  expect(created.exitCode, created.stderr).toBe(0);
  const id = (JSON.parse(created.stdout).data as { id: string }).id;
  const renewed = await cli([
    'task',
    'renew',
    id,
    '--due-date',
    '2026-09-10',
    '--recovery-strategy',
    'reopened',
  ]);
  expect(renewed.exitCode, renewed.stderr).toBe(0);
  expect(JSON.parse(renewed.stdout)).toMatchObject({
    data: { version: 2, status: 'reopened' },
    meta: { expectedVersion: 1 },
  });
  const added = await cli([
    'comment',
    'create',
    id,
    '--content',
    'CLI 原正文',
    '--expected-version',
    '2',
  ]);
  expect(added.exitCode, added.stderr).toBe(0);
  const comment = (
    JSON.parse(added.stdout).data.timeline as {
      kind: string;
      commentId?: string;
    }[]
  ).find((event) => event.kind === 'comment');
  expect(comment?.commentId).toBeTypeOf('string');
  const commentId = comment!.commentId!;
  const contentFile = join(directory, 'comment.txt');
  await writeFile(contentFile, 'CLI 新正文');
  const edited = await cli([
    'comment',
    'edit',
    id,
    commentId,
    '--content-file',
    contentFile,
  ]);
  expect(edited.exitCode, edited.stderr).toBe(0);
  expect(JSON.parse(edited.stdout).data).toMatchObject({
    version: 4,
    timeline: expect.arrayContaining([
      expect.objectContaining({ content: 'CLI 新正文', edited: true }),
    ]),
  });
  const conflict = await cli([
    'comment',
    'delete',
    id,
    commentId,
    '--expected-version',
    '3',
    '--yes',
  ]);
  expect(conflict.exitCode).toBe(75);
  expect(conflict.stdout).toBe('');
  expect(JSON.parse(conflict.stderr)).toMatchObject({
    error: { status: 409, hint: expect.stringContaining('task get') },
    meta: { expectedVersion: 3, exitCode: 75 },
  });
  const refused = await cli(['comment', 'delete', id, commentId]);
  expect(refused.exitCode).toBe(64);
  const unchanged = await cli(['task', 'get', id]);
  expect(JSON.parse(unchanged.stdout).data.version).toBe(4);
  const deleted = await cli(['comment', 'delete', id, commentId, '--yes']);
  expect(deleted.exitCode, deleted.stderr).toBe(0);
  expect(JSON.parse(deleted.stdout).data).toMatchObject({
    version: 5,
    timeline: expect.arrayContaining([
      expect.objectContaining({ commentId, deleted: true, content: null }),
    ]),
  });
  expect(deleted.stdout).not.toContain('CLI 原正文');
  expect(deleted.stdout).not.toContain('CLI 新正文');
  const closed = await cli(['task', 'act', id, 'close']);
  expect(closed.exitCode, closed.stderr).toBe(0);
  expect(JSON.parse(closed.stdout).data).toMatchObject({
    status: 'closed',
    version: 6,
  });
});
