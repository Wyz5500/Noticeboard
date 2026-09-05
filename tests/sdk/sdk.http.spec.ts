/** Exercises only public SDK calls against the real host API and isolated PostgreSQL. */
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module.js';
import { configureHttpApplication } from '../../apps/api/src/common/presentation/configure-http-application.js';
import {
  createNoticeboardClient,
  NoticeboardApiError,
} from '../../apps/cli/src/sdk/index.js';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl)
  throw new Error('DATABASE_URL_TEST is required for SDK HTTP smoke');
let app: NestFastifyApplication | undefined;
let baseUrl: string;

/** Exercises the public reset facade against the real endpoint and preserves missing-identity errors. */
it('resets through public SDK and requires a valid identity', async () => {
  const anonymous = createNoticeboardClient({ baseUrl });
  await expect(anonymous.demo.reset()).rejects.toMatchObject({
    kind: 'api',
    status: 401,
    path: '/api/v1/demo/reset',
  });
  const client = createNoticeboardClient({
    baseUrl,
    getHeaders: () => ({ 'X-Demo-User-Id': 'noticeboard-admin' }),
  });
  expect(await client.demo.reset()).toEqual({ reset: true });
  expect(await client.tasks.list()).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'task-herbs' })]),
  );
});

/** Starts on an OS-assigned loopback port and uses the verification database supplied by the host runner. */
beforeAll(async () => {
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

/** Closes the listening socket and database pool even if an assertion fails. */
afterAll(async () => {
  await app?.close();
});

/** Management reads accept live schemas while the server remains the sole authorization authority. */
it('reads a protected overview and preserves real authorization failures', async () => {
  const client = createNoticeboardClient({
    baseUrl,
    getHeaders: () => ({ 'X-Demo-User-Id': 'noticeboard-admin' }),
  });
  const overview = await client.admin.overview();
  expect(overview.users).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'noticeboard-admin', active: true }),
    ]),
  );
  expect(overview.roles).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        permissions: expect.arrayContaining(['system.manage']),
      }),
    ]),
  );
  expect(overview.permissions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'system.manage' }),
    ]),
  );
  for (const [user, status] of [
    ['noticeboard-master', 403],
    ['sdk-missing-admin', 401],
  ] as const) {
    const denied = createNoticeboardClient({
      baseUrl,
      getHeaders: () => ({ 'X-Demo-User-Id': user }),
    });
    await expect(denied.admin.overview()).rejects.toMatchObject({
      kind: 'api',
      status,
      path: '/api/v1/admin/overview',
    });
  }
});

/** Confirms all three resource adapters accept live schemas and preserve real HTTP failures. */
it('reads identities and tasks and maps server errors over host HTTP', async () => {
  const client = createNoticeboardClient({
    baseUrl,
    getHeaders: () => ({ 'X-Demo-User-Id': 'noticeboard-master' }),
  });
  expect(await client.identities.list()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'noticeboard-master' }),
    ]),
  );
  const tasks = await client.tasks.list();
  expect(tasks.length).toBeGreaterThan(0);
  // Compare a stable seed rather than a task left by another smoke suite.
  const task = tasks.find((task) => task.id === 'task-herbs')!;
  expect(task).toBeDefined();
  expect(await client.tasks.get(task.id)).toMatchObject({
    id: task.id,
    dueDate: expect.any(String),
    version: expect.any(Number),
    timeline: expect.any(Array),
  });
  await expect(client.tasks.get('sdk-missing-task')).rejects.toMatchObject({
    kind: 'api',
    status: 404,
    code: expect.any(String),
    path: '/api/v1/tasks/sdk-missing-task',
  });
  const invalid = createNoticeboardClient({
    baseUrl,
    getHeaders: () => ({ 'X-Demo-User-Id': 'sdk-missing-user' }),
  });
  const error = await invalid.tasks.list().catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(NoticeboardApiError);
  expect(error).toMatchObject({
    kind: 'api',
    status: 401,
    code: expect.any(String),
    timestamp: expect.any(String),
  });
});

/** Exercises every write operation against persisted versions and public comment projections. */
it('creates, acts, renews and folds comment revisions over real HTTP', async () => {
  const client = createNoticeboardClient({
    baseUrl,
    getHeaders: () => ({ 'X-Demo-User-Id': 'noticeboard-master' }),
  });
  const created = await client.tasks.create({
    title: 'SDK 写入验证',
    type: 'exploration',
    description: '独立任务',
    reward: '测试',
    dueDate: '2026-08-31',
  });
  expect(created).toMatchObject({ version: 1, status: 'expired' });
  const renewed = await client.tasks.renew(created.id, {
    dueDate: '2026-09-10',
    recoveryStrategy: 'preserve_status',
    expectedVersion: 1,
  });
  expect(renewed).toMatchObject({ version: 2, status: 'not_started' });
  const added = await client.comments.create(created.id, {
    content: 'SDK 原正文',
    expectedVersion: 2,
  });
  const comment = added.timeline.find((event) => event.kind === 'comment');
  expect(comment?.kind).toBe('comment');
  if (comment?.kind !== 'comment') throw new Error('missing created comment');
  const edited = await client.comments.edit(created.id, comment.commentId, {
    content: 'SDK 新正文',
    expectedVersion: 3,
  });
  expect(edited).toMatchObject({ version: 4 });
  expect(edited.timeline).toContainEqual(
    expect.objectContaining({
      kind: 'comment',
      content: 'SDK 新正文',
      edited: true,
      commentId: comment.commentId,
    }),
  );
  await expect(
    client.comments.delete(created.id, comment.commentId, {
      expectedVersion: 3,
    }),
  ).rejects.toMatchObject({ kind: 'api', status: 409 });
  expect((await client.tasks.get(created.id)).version).toBe(4);
  const deleted = await client.comments.delete(created.id, comment.commentId, {
    expectedVersion: 4,
  });
  expect(deleted).toMatchObject({ version: 5 });
  expect(deleted.timeline).toContainEqual(
    expect.objectContaining({
      kind: 'comment',
      deleted: true,
      content: null,
      commentId: comment.commentId,
    }),
  );
  expect(JSON.stringify(deleted)).not.toContain('SDK 原正文');
  expect(JSON.stringify(deleted)).not.toContain('SDK 新正文');
  const accepted = await client.tasks.act(created.id, {
    action: 'accept',
    expectedVersion: 5,
  });
  expect(accepted).toMatchObject({ version: 6, status: 'in_progress' });
  const completed = await client.tasks.act(created.id, {
    action: 'complete',
    expectedVersion: 6,
  });
  expect(completed).toMatchObject({ version: 7, status: 'completed' });
  const reopened = await client.tasks.act(created.id, {
    action: 'reopen',
    expectedVersion: 7,
  });
  expect(reopened).toMatchObject({ version: 8, status: 'reopened' });
  const closed = await client.tasks.act(created.id, {
    action: 'close',
    expectedVersion: 8,
  });
  expect(closed).toMatchObject({ version: 9, status: 'closed' });
});
