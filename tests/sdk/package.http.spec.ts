/** Verifies installed SDK and CLI interoperability through real host HTTP and isolated verification PostgreSQL. */
import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module.js';
import { configureHttpApplication } from '../../apps/api/src/common/presentation/configure-http-application.js';

const execute = promisify(execFile);
const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl)
  throw new Error(
    'DATABASE_URL_TEST is required for installed package HTTP smoke',
  );

/** Detects installation-only breakage and ensures shared HTTP state, identity isolation and conflicts survive packaging. */
it('uses independent installed clients against the same versioned API', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'noticeboard-installed-http-'),
  );
  const npm =
    process.env.npm_execpath ??
    resolve(
      dirname(process.execPath),
      '../lib/node_modules/npm/bin/npm-cli.js',
    );
  const env = {
    ...process.env,
    npm_config_cache: join(directory, 'cache'),
    npm_config_offline: 'true',
    NOTICEBOARD_CONFIG_FILE: join(directory, 'unused.json'),
  };
  let app: NestFastifyApplication | undefined;
  try {
    for (const target of ['sdk', 'cli']) {
      await execute(
        process.execPath,
        ['scripts/pack-client.mjs', target, '--out-dir', directory],
        { env },
      );
    }
    await writeFile(
      join(directory, 'package.json'),
      '{"private":true,"type":"module"}',
    );
    await execute(
      process.execPath,
      [
        npm,
        'install',
        join(directory, 'noticeboard-sdk-local-0.0.0.tgz'),
        join(directory, 'noticeboard-cli-local-0.0.0.tgz'),
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
      ],
      { cwd: directory, env },
    );
    await copyFile(
      'tests/sdk/installed-consumer.mjs',
      join(directory, 'consumer.mjs'),
    );
    process.env.DATABASE_URL = databaseUrl;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    configureHttpApplication(app);
    await app.listen(0, '127.0.0.1');
    const baseUrl = await app.getUrl();
    const sdk = await execute(process.execPath, ['consumer.mjs', baseUrl], {
      cwd: directory,
      env,
    });
    const task = JSON.parse(sdk.stdout) as { id: string; version: number };
    const cli = await execute(
      process.execPath,
      [
        join(directory, 'node_modules/.bin/noticeboard'),
        'task',
        'get',
        task.id,
        '--base-url',
        baseUrl,
        '--user',
        'noticeboard-master',
        '--json',
      ],
      { cwd: directory, env },
    );
    expect(JSON.parse(cli.stdout).data).toMatchObject(task);
    expect(cli.stderr).toBe('');
  } finally {
    await app?.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
