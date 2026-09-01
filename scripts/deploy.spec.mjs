/** Verifies the deployment wrapper exposes a safe dry-run and help contract. */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(SCRIPT_DIRECTORY, 'instance.mjs');
const COMPOSE_PATH = resolve(SCRIPT_DIRECTORY, '../compose.yaml');
const PLAYWRIGHT_PATH = resolve(SCRIPT_DIRECTORY, '../playwright.config.ts');

/** Loads Playwright configuration in a clean child process for environment-sensitive assertions. */
function readPlaywrightConfig(environment) {
  const childEnvironment = { ...process.env };
  for (const key of ['DATABASE_URL', 'DATABASE_URL_TEST', 'E2E_BASE_URL'])
    delete childEnvironment[key];
  Object.assign(childEnvironment, environment);
  const moduleUrl = pathToFileURL(PLAYWRIGHT_PATH).href;
  const source = `import config from ${JSON.stringify(moduleUrl)};
process.stdout.write(JSON.stringify({
  baseURL: config.use?.baseURL,
  databaseUrl: config.webServer?.env?.DATABASE_URL,
  port: config.webServer?.env?.PORT,
  webServerUrl: config.webServer?.url,
}));`;
  return JSON.parse(
    execFileSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', source],
      {
        cwd: resolve(SCRIPT_DIRECTORY, '..'),
        env: childEnvironment,
        encoding: 'utf8',
      },
    ),
  );
}

/** Runs the instance CLI with the requested argument and returns its output. */
function runScript(argument) {
  return execFileSync(process.execPath, [SCRIPT_PATH, 'up', argument], {
    encoding: 'utf8',
  });
}

const dryRun = runScript('--dry-run');
assert.match(
  dryRun,
  /DRY RUN: .*docker compose .*compose\.yaml -p noticeboard-/,
);
assert.match(dryRun, / up -d --build --wait/);

const help = execFileSync(process.execPath, [SCRIPT_PATH, '--help'], {
  encoding: 'utf8',
});
assert.match(help, /用法：.*instance/);
assert.match(help, /--dry-run/);

/** Proves Compose leaves project naming and volume naming to the instance CLI. */
const compose = readFileSync(COMPOSE_PATH, 'utf8');
assert.equal(/^name:/m.test(compose), false);
assert.match(
  compose,
  /DATABASE_URL: postgresql:\/\/noticeboard:noticeboard@postgres:5432\/noticeboard/,
);
assert.match(compose, /POSTGRES_DB: noticeboard/);
assert.match(compose, /POSTGRES_PASSWORD: noticeboard/);
assert.match(compose, /POSTGRES_USER: noticeboard/);
assert.match(compose, /127\.0\.0\.1:\$\{POSTGRES_HOST_PORT-54329\}:5432/);
assert.match(compose, /127\.0\.0\.1:\$\{APP_HOST_PORT-3000\}:3000/);
assert.match(compose, /^\s{6}- postgres-data:\/var\/lib\/postgresql$/m);
assert.equal(/^\s{4}name: noticeboard-postgres$/m.test(compose), false);

/** Proves standalone browser commands retain the prescribed local database fallback. */
const playwright = readFileSync(PLAYWRIGHT_PATH, 'utf8');
assert.match(
  playwright,
  /postgresql:\/\/noticeboard:noticeboard@127\.0\.0\.1:54329\/noticeboard/,
);
assert.match(playwright, /process\.env\.DATABASE_URL_TEST\?\.trim\(\) \|\|/);
assert.doesNotMatch(playwright, /process\.env\.DATABASE_URL \?\?/);
assert.match(
  playwright,
  /process\.env\.E2E_BASE_URL\?\.trim\(\) \|\| undefined/,
);
assert.match(playwright, /PORT: '3100'/);
assert.match(playwright, /standaloneAppUrl = 'http:\/\/127\.0\.0\.1:3100'/);
assert.doesNotMatch(playwright, /PORT: '3000'/);

/** Proves standalone runs ignore a runtime DATABASE_URL and normalize blank external URLs. */
const standaloneConfig = readPlaywrightConfig({
  DATABASE_URL:
    'postgresql://noticeboard:noticeboard@127.0.0.1:59999/production',
  E2E_BASE_URL: '   ',
});
assert.equal(standaloneConfig.baseURL, 'http://127.0.0.1:3100');
assert.equal(
  standaloneConfig.databaseUrl,
  'postgresql://noticeboard:noticeboard@127.0.0.1:54329/noticeboard',
);
assert.equal(standaloneConfig.port, '3100');
assert.equal(
  standaloneConfig.webServerUrl,
  'http://127.0.0.1:3100/health/ready',
);

/** Proves a nonblank external instance disables the standalone web server. */
const externalConfig = readPlaywrightConfig({
  DATABASE_URL_TEST:
    'postgresql://noticeboard:noticeboard@127.0.0.1:4555/noticeboard',
  E2E_BASE_URL: ' http://127.0.0.1:4556 ',
});
assert.equal(externalConfig.baseURL, 'http://127.0.0.1:4556');
assert.equal(externalConfig.webServerUrl, undefined);
