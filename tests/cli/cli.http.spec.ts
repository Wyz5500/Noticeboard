/** Exercises built CLI subprocesses through a real host API and isolated verification PostgreSQL. */
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
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
async function cli(args: string[]) {
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
    return {
      ...(await execute(process.execPath, command, options)),
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
  const first = JSON.parse(tasks.stdout).data[0] as {
    id: string;
    version: number;
  };
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
