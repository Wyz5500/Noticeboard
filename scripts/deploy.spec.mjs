/** Tests the permanent deployment and standalone browser lifecycle contracts. */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as deployment from './deploy.mjs';

const { createDeploymentArguments, isPrimaryWorktreeGitDirectory } = deployment;

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const DEPLOY_WRAPPER_PATH = resolve(SCRIPT_DIRECTORY, 'deploy.sh');
const DEPLOY_COMPOSE_PATH = resolve(PROJECT_ROOT, 'compose.deploy.yaml');
const PLAYWRIGHT_PATH = resolve(PROJECT_ROOT, 'playwright.config.ts');
const PLAYWRIGHT_RUNNER_PATH = resolve(SCRIPT_DIRECTORY, 'run-playwright.mjs');
const DEPLOY_SCRIPT_PATH = resolve(SCRIPT_DIRECTORY, 'deploy.mjs');

process.env.npm_config_user_agent ??= 'npm/11.19.1 node/v24.20.0';
process.env.PATH = `${dirname(process.execPath)}:${process.env.PATH ?? ''}`;

/** Loads Playwright configuration in a clean child process for environment-sensitive assertions. */
function readPlaywrightConfig(environment) {
  const childEnvironment = { ...process.env };
  for (const key of [
    'DATABASE_URL',
    'DATABASE_URL_TEST',
    'E2E_BASE_URL',
    'TASK_BUSINESS_TIME_ZONE',
    'TASK_CURRENT_DATE_OVERRIDE',
  ]) {
    delete childEnvironment[key];
  }
  Object.assign(childEnvironment, environment);
  const moduleUrl = pathToFileURL(PLAYWRIGHT_PATH).href;
  const source = `import config from ${JSON.stringify(moduleUrl)};
process.stdout.write(JSON.stringify({
  baseURL: config.use?.baseURL,
  timezoneId: config.use?.timezoneId,
  hasWebServer: config.webServer !== undefined,
}));`;
  return JSON.parse(
    execFileSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', source],
      {
        cwd: PROJECT_ROOT,
        env: childEnvironment,
        encoding: 'utf8',
      },
    ),
  );
}

/** Rejects deploy and browser orchestration when npm uses the wrong major. */
test('checks npm before deployment or browser command parsing starts', () => {
  const environment = {
    ...process.env,
    npm_config_user_agent: 'npm/10.8.2 node/v24.20.0',
  };
  for (const [script, argumentsToRun] of [
    [DEPLOY_SCRIPT_PATH, ['--help']],
    [PLAYWRIGHT_RUNNER_PATH, ['e2e', '--dry-run']],
  ]) {
    assert.throws(
      () =>
        execFileSync(process.execPath, [script, ...argumentsToRun], {
          cwd: PROJECT_ROOT,
          env: environment,
          encoding: 'utf8',
          stdio: 'pipe',
        }),
      (error) => {
        assert.equal(error.status, 1);
        assert.match(error.stderr, /npm 11\.x/);
        return true;
      },
    );
  }
});

/** Prevents a linked worktree from being mistaken for the primary checkout. */
test('recognizes only the common Git directory as the primary worktree', () => {
  assert.equal(isPrimaryWorktreeGitDirectory('/repo/.git', '/repo/.git'), true);
  assert.equal(
    isPrimaryWorktreeGitDirectory(
      '/repo/.git',
      '/repo/.git/worktrees/feature-a',
    ),
    false,
  );
});

/** Allows permanent deployment only from a clean primary main checkout. */
test('validates the permanent deployment Git state', () => {
  assert.equal(typeof deployment.assertDeployableGitState, 'function');
  assert.doesNotThrow(() =>
    deployment.assertDeployableGitState({
      commonDirectory: '/repo/.git',
      gitDirectory: '/repo/.git',
      branch: 'main',
      status: '',
    }),
  );
  assert.throws(
    () =>
      deployment.assertDeployableGitState({
        commonDirectory: '/repo/.git',
        gitDirectory: '/repo/.git/worktrees/feature',
        branch: 'main',
        status: '',
      }),
    /linked worktree/,
  );
  assert.throws(
    () =>
      deployment.assertDeployableGitState({
        commonDirectory: '/repo/.git',
        gitDirectory: '/repo/.git',
        branch: 'feature/example',
        status: '',
      }),
    /main 分支/,
  );
  assert.throws(
    () =>
      deployment.assertDeployableGitState({
        commonDirectory: '/repo/.git',
        gitDirectory: '/repo/.git',
        branch: null,
        status: '',
      }),
    /detached HEAD/,
  );
  assert.throws(
    () =>
      deployment.assertDeployableGitState({
        commonDirectory: '/repo/.git',
        gitDirectory: '/repo/.git',
        branch: 'main',
        status: ' M README.md',
      }),
    /clean/,
  );
});

/** Applies primary and main guards even when deployment is a dry-run. */
test('deployment dry-run does not bypass Git guards', async () => {
  await assert.rejects(
    deployment.deployPermanent(
      { dryRun: true },
      {
        readGitState: () => ({
          commonDirectory: '/repo/.git',
          gitDirectory: '/repo/.git/worktrees/feature',
          branch: 'feature/example',
          status: '',
        }),
      },
    ),
    /linked worktree/,
  );
});

/** Prevents repeated deployment from gaining a destructive lifecycle branch. */
test('deployment only upgrades the fixed noticeboard project', () => {
  const argumentsToRun = createDeploymentArguments(DEPLOY_COMPOSE_PATH);

  assert.deepEqual(argumentsToRun, [
    'compose',
    '-f',
    DEPLOY_COMPOSE_PATH,
    '-p',
    'noticeboard',
    'up',
    '-d',
    '--build',
    '--wait',
  ]);
  assert.doesNotMatch(
    argumentsToRun.join(' '),
    /\bdown\b|\bdestroy\b|volume rm|system prune/,
  );
});

/** Prevents the shell compatibility wrapper from bypassing the deployment CLI parser. */
test('deployment shell wrapper delegates the help contract', () => {
  const output = execFileSync(DEPLOY_WRAPPER_PATH, ['--help'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });

  assert.match(output, /用法：npm run deploy/);
  assert.match(output, /--dry-run/);
});

/** Prevents the compatibility wrapper from silently ignoring unsupported arguments. */
test('deployment shell wrapper rejects extra arguments', () => {
  assert.throws(
    () =>
      execFileSync(DEPLOY_WRAPPER_PATH, ['--dry-run', 'extra'], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    (error) => {
      assert.equal(error.status, 64);
      assert.match(error.stderr, /未知选项|多余参数/);
      return true;
    },
  );
});

/** Prevents the permanent database from being exposed on a host port. */
test('deployment Compose fixes only the app host port and retains the legacy data volume', () => {
  const compose = readFileSync(DEPLOY_COMPOSE_PATH, 'utf8');

  const postgresSection = compose.slice(
    compose.indexOf('  postgres:'),
    compose.indexOf('\n  migrate:'),
  );
  assert.match(compose, /127\.0\.0\.1:3000:3000/);
  assert.doesNotMatch(compose, /POSTGRES_HOST_PORT|54329:5432/);
  assert.match(postgresSection, /restart: unless-stopped/);
  assert.match(compose, /^\s{4}name: noticeboard-postgres$/m);
  assert.match(compose, /TASK_BUSINESS_TIME_ZONE: Asia\/Shanghai/);
  assert.doesNotMatch(compose, /TASK_CURRENT_DATE_OVERRIDE/);
});

/** Verifies readiness, static assets, OpenAPI, and a database-backed API after Compose starts. */
test('deployment smoke checks cover every permanent runtime boundary', async () => {
  const requests = [];
  const responses = new Map([
    [
      '/health/ready',
      {
        ok: true,
        status: 200,
        json: async () => ({ status: 'ready', database: 'up' }),
      },
    ],
    ['/', { ok: true, status: 200, json: async () => ({}) }],
    [
      '/api/openapi.json',
      { ok: true, status: 200, json: async () => ({ openapi: '3.0.0' }) },
    ],
    ['/api/v1/tasks', { ok: true, status: 200, json: async () => [] }],
  ]);
  await deployment.runDeploymentSmokeChecks({
    fetchRequest: async (url, options) => {
      const parsed = new URL(url);
      requests.push({ path: parsed.pathname, options });
      return responses.get(parsed.pathname);
    },
    delay: async () => undefined,
  });

  assert.deepEqual(
    requests.map(({ path }) => path),
    ['/health/ready', '/', '/api/openapi.json', '/api/v1/tasks'],
  );
  assert.equal(
    requests.at(-1).options.headers['X-Demo-User-Id'],
    'noticeboard-master',
  );
});

/** Treats liveness without database readiness as a failed deployment. */
test('deployment smoke checks reject an unavailable database', async () => {
  await assert.rejects(
    deployment.runDeploymentSmokeChecks({
      fetchRequest: async () => ({
        ok: false,
        status: 503,
        json: async () => ({ status: 'not-ready', database: 'down' }),
      }),
      delay: async () => undefined,
      readinessAttempts: 1,
    }),
    /就绪检查失败/,
  );
});

/** Prevents raw Playwright configuration from reviving fixed standalone ports. */
test('Playwright configuration requires an injected dynamic instance', () => {
  const standaloneConfig = readPlaywrightConfig({ E2E_BASE_URL: '   ' });
  assert.equal(standaloneConfig.baseURL, undefined);
  assert.equal(standaloneConfig.timezoneId, 'Asia/Shanghai');
  assert.equal(standaloneConfig.hasWebServer, false);

  const externalConfig = readPlaywrightConfig({
    E2E_BASE_URL: ' http://127.0.0.1:4556 ',
    TASK_BUSINESS_TIME_ZONE: ' Pacific/Auckland ',
  });
  assert.equal(externalConfig.baseURL, 'http://127.0.0.1:4556');
  assert.equal(externalConfig.timezoneId, 'Pacific/Auckland');
  assert.equal(externalConfig.hasWebServer, false);
});

/** Runs standalone browser checks on the host with only an isolated PostgreSQL container. */
test('standalone Playwright dry-run uses a database-only project and host app', () => {
  const childEnvironment = { ...process.env };
  delete childEnvironment.DATABASE_URL_TEST;
  delete childEnvironment.E2E_BASE_URL;
  const output = execFileSync(
    process.execPath,
    [PLAYWRIGHT_RUNNER_PATH, 'e2e', '--dry-run'],
    { cwd: PROJECT_ROOT, env: childEnvironment, encoding: 'utf8' },
  );

  assert.match(output, /-playwright up -d --wait postgres/);
  assert.match(output, /npm run db:migrate/);
  assert.match(output, /npm run db:seed/);
  assert.match(output, /npm run build/);
  assert.match(output, /HOST=127\.0\.0\.1 PORT=0 .*dist\/api\/main\.js/);
  assert.match(output, /playwright test --grep-invert '?@visual'?/);
  assert.match(output, /-playwright down -v --remove-orphans/);
  assert.doesNotMatch(
    output,
    /--build|APP_HOST_PORT|port app|127\.0\.0\.1:(?:3000|3100|54329)/,
  );
});

/** Uses an injected host application without starting Docker or another application. */
test('external Playwright dry-run only runs the browser command', () => {
  const output = execFileSync(
    process.execPath,
    [PLAYWRIGHT_RUNNER_PATH, 'e2e', '--dry-run'],
    {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        E2E_BASE_URL: 'http://127.0.0.1:43123',
      },
      encoding: 'utf8',
    },
  );

  assert.match(output, /playwright test --grep-invert '?@visual'?/);
  assert.doesNotMatch(
    output,
    /docker compose|npm run build|dist\/api\/main\.js/,
  );
});

/** Preserves targeted Playwright files and project options through the lifecycle wrapper. */
test('standalone Playwright forwards standard test arguments', () => {
  const childEnvironment = { ...process.env };
  delete childEnvironment.DATABASE_URL_TEST;
  delete childEnvironment.E2E_BASE_URL;
  const output = execFileSync(
    process.execPath,
    [
      PLAYWRIGHT_RUNNER_PATH,
      'e2e',
      'tests/e2e/behavior.spec.ts',
      '--project=chromium-desktop',
      '--dry-run',
    ],
    { cwd: PROJECT_ROOT, env: childEnvironment, encoding: 'utf8' },
  );

  assert.match(
    output,
    /playwright test --grep-invert '?@visual'? tests\/e2e\/behavior\.spec\.ts --project=chromium-desktop/,
  );
});
