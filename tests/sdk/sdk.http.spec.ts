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
  const task = tasks[0]!;
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
