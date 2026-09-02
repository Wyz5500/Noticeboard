/** Tests the permanent deployment and standalone browser lifecycle contracts. */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createDeploymentArguments,
  isPrimaryWorktreeGitDirectory,
} from './deploy.mjs';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const DEPLOY_WRAPPER_PATH = resolve(SCRIPT_DIRECTORY, 'deploy.sh');
const DEPLOY_COMPOSE_PATH = resolve(PROJECT_ROOT, 'compose.deploy.yaml');
const PLAYWRIGHT_PATH = resolve(PROJECT_ROOT, 'playwright.config.ts');
const PLAYWRIGHT_RUNNER_PATH = resolve(SCRIPT_DIRECTORY, 'run-playwright.mjs');

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

/** Prevents standalone browser checks from using shared fixed ports or retaining successful data. */
test('standalone Playwright dry-run uses its own dynamic project and removes its volume', () => {
  const childEnvironment = { ...process.env };
  delete childEnvironment.DATABASE_URL_TEST;
  delete childEnvironment.E2E_BASE_URL;
  const output = execFileSync(
    process.execPath,
    [PLAYWRIGHT_RUNNER_PATH, 'e2e', '--dry-run'],
    { cwd: PROJECT_ROOT, env: childEnvironment, encoding: 'utf8' },
  );

  assert.match(output, /-playwright .*up -d --build --wait/);
  assert.match(output, /APP_HOST_PORT=/);
  assert.match(output, /POSTGRES_HOST_PORT=/);
  assert.match(output, /playwright test --grep-invert '?@visual'?/);
  assert.match(output, /-playwright .*down -v --remove-orphans/);
  assert.doesNotMatch(output, /127\.0\.0\.1:3100|127\.0\.0\.1:54329/);
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
