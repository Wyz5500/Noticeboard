/** Exercises the generated client against a real host HTTP listener and PostgreSQL-backed API. */
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module.js';
import { configureHttpApplication } from '../../apps/api/src/common/presentation/configure-http-application.js';
import {
  listDemoUsers,
  listTasks,
} from '../../apps/cli/src/sdk/internal/generated/transport.js';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl)
  throw new Error(
    'DATABASE_URL_TEST is required for generated transport HTTP smoke',
  );
let app: NestFastifyApplication | undefined;
let baseUrl: string;

/** Starts the real API only on an OS-assigned loopback port in the isolated test database. */
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

/** Always closes the host socket and TypeORM pool, including assertion failures. */
afterAll(async () => {
  await app?.close();
});

/** Binds a single origin while retaining native Fetch request, cancellation and response semantics. */
const fetchAtOrigin: typeof fetch = (input, init) =>
  fetch(new URL(input instanceof Request ? input.url : input, baseUrl), init);

/** Verifies operation paths, live JSON parsing and demo identity headers over actual HTTP. */
it('reads identities and tasks using the generated transport over host HTTP', async () => {
  const identities = await listDemoUsers(undefined, fetchAtOrigin);
  expect(identities.status).toBe(200);
  expect(identities.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'noticeboard-master' }),
    ]),
  );
  const tasks = await listTasks(
    { headers: { 'X-Demo-User-Id': 'noticeboard-master' } },
    fetchAtOrigin,
  );
  expect(tasks.status).toBe(200);
  expect(Array.isArray(tasks.data)).toBe(true);
  const rejected = await listTasks(
    { headers: { 'X-Demo-User-Id': 'missing-demo-user' } },
    fetchAtOrigin,
  );
  expect(rejected.status).toBe(401);
  expect(rejected.data).toMatchObject({
    error: { code: expect.any(String) },
    path: '/api/v1/tasks',
  });
});
