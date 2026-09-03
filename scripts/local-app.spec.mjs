/** Tests host application startup, ready discovery, and process cleanup. */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as localApp from './local-app.mjs';

const LOCAL_RUNNER_PATH = fileURLToPath(
  new URL('./run-local.mjs', import.meta.url),
);
process.env.npm_config_user_agent ??= 'npm/11.19.1 node/v24.20.0';

/** Forces every local application onto loopback and an operating-system assigned port. */
test('creates host-only dynamic application environment', () => {
  assert.deepEqual(
    localApp.createLocalApplicationEnvironment({
      DATABASE_URL: 'postgresql://localhost/noticeboard',
      TASK_BUSINESS_TIME_ZONE: 'Asia/Shanghai',
    }),
    {
      DATABASE_URL: 'postgresql://localhost/noticeboard',
      TASK_BUSINESS_TIME_ZONE: 'Asia/Shanghai',
      HOST: '127.0.0.1',
      PORT: '0',
    },
  );
});

/** Accepts only the structured ready event and reserves deployment port 3000. */
test('parses a safe dynamic application ready event', () => {
  assert.equal(
    localApp.parseApplicationReadyLine(
      '{"event":"application.ready","url":"http://127.0.0.1:43123"}',
    ),
    'http://127.0.0.1:43123',
  );
  assert.equal(localApp.parseApplicationReadyLine('{"level":"info"}'), null);
  assert.throws(
    () =>
      localApp.parseApplicationReadyLine(
        '{"event":"application.ready","url":"http://127.0.0.1:3000"}',
      ),
    /保留端口 3000/,
  );
  assert.throws(
    () =>
      localApp.parseApplicationReadyLine(
        '{"event":"application.ready","url":"http://0.0.0.0:43123"}',
      ),
    /127\.0\.0\.1/,
  );
});

/** Discovers one real child ready event and stops the process gracefully. */
test('starts and stops a host application child process', async () => {
  const fixture = `
process.stdout.write(JSON.stringify({event:'application.ready',url:'http://127.0.0.1:43123'}) + '\\n');
setInterval(() => {}, 1000);
process.on('SIGTERM', () => process.exit(0));
`;
  const application = await localApp.startLocalApplication({
    command: process.execPath,
    args: ['--input-type=module', '-e', fixture],
    environment: { DATABASE_URL: 'postgresql://localhost/noticeboard' },
    forwardOutput: false,
    startupTimeoutMs: 1_000,
  });

  assert.equal(application.baseUrl, 'http://127.0.0.1:43123');
  assert.equal(application.child.exitCode, null);
  await application.stop();
  assert.notEqual(application.child.exitCode, null);
});

/** Prepares the dev database and starts the watcher entirely on the host. */
test('local development dry-run uses PostgreSQL-only Docker and a host watcher', () => {
  const output = execFileSync(
    process.execPath,
    [LOCAL_RUNNER_PATH, '--dry-run'],
    { encoding: 'utf8' },
  );

  assert.match(output, /-dev up -d --wait postgres/);
  assert.match(output, /npm run db:migrate/);
  assert.match(output, /npm run db:seed/);
  assert.match(output, /npm run build:web/);
  assert.match(output, /HOST=127\.0\.0\.1 PORT=0 npm exec -- tsx/);
  assert.doesNotMatch(output, /--build|APP_HOST_PORT|127\.0\.0\.1:3000/);
});

/** Terminates a child that exits or stalls before announcing readiness. */
test('rejects failed and timed-out application startup', async () => {
  await assert.rejects(
    localApp.startLocalApplication({
      command: process.execPath,
      args: ['--input-type=module', '-e', 'process.exit(7)'],
      environment: { DATABASE_URL: 'postgresql://localhost/noticeboard' },
      forwardOutput: false,
      startupTimeoutMs: 1_000,
    }),
    /就绪前退出.*7/,
  );

  await assert.rejects(
    localApp.startLocalApplication({
      command: process.execPath,
      args: ['--input-type=module', '-e', 'setInterval(() => {}, 1000)'],
      environment: { DATABASE_URL: 'postgresql://localhost/noticeboard' },
      forwardOutput: false,
      startupTimeoutMs: 20,
    }),
    /等待本机应用就绪超时/,
  );
});
