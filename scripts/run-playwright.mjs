/** Runs host browser checks against an injected app or a PostgreSQL-only standalone fixture. */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatCommand,
  readInstanceContext,
  runHostNpmScript,
  startDatabaseInstance,
  stopDatabaseInstance,
} from './instance.mjs';
import { withLifecycleLock } from './lifecycle-lock.mjs';
import { startLocalApplication } from './local-app.mjs';
import { assertSupportedRuntimeVersions } from './runtime-version.mjs';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** Parses one browser mode while forwarding Playwright arguments unchanged. */
function parseArguments(argumentsFromCli) {
  const [mode, ...argumentsAfterMode] = argumentsFromCli;
  if (mode !== 'e2e' && mode !== 'visual') {
    throw new Error(
      '用法：node scripts/run-playwright.mjs <e2e|visual> [Playwright 参数] [--dry-run]',
    );
  }
  return {
    mode,
    dryRun: argumentsAfterMode.includes('--dry-run'),
    playwrightArguments: argumentsAfterMode.filter(
      (argument) => argument !== '--dry-run',
    ),
  };
}

/** Returns the raw Playwright arguments for one public browser command. */
export function createPlaywrightArguments(mode, additionalArguments = []) {
  if (mode === 'e2e') {
    return ['test', '--grep-invert', '@visual', ...additionalArguments];
  }
  if (mode === 'visual') {
    return ['test', '--grep', '@visual', ...additionalArguments];
  }
  throw new Error(`未知 Playwright 模式：${mode}`);
}

/** Runs Playwright through the local package binary with an injected host URL. */
export function runRawPlaywright(
  mode,
  environment,
  { dryRun = false, playwrightArguments: additionalArguments = [] } = {},
) {
  const playwrightArguments = createPlaywrightArguments(
    mode,
    additionalArguments,
  );
  if (dryRun) {
    process.stdout.write(
      `DRY RUN: ${formatCommand('playwright', playwrightArguments)}\n`,
    );
    return;
  }
  const result = spawnSync(
    NPM_COMMAND,
    ['exec', '--', 'playwright', ...playwrightArguments],
    {
      cwd: PROJECT_ROOT,
      env: { ...process.env, ...environment },
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Playwright ${mode} 失败（退出码 ${result.status ?? 1}）`);
  }
}

/** Prints the host production application command used by standalone browser checks. */
function printApplicationDryRun(environment) {
  const environmentPrefix = Object.entries({
    ...environment,
    HOST: '127.0.0.1',
    PORT: '0',
  })
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  process.stdout.write(
    `DRY RUN: ${environmentPrefix} ${formatCommand(process.execPath, ['dist/api/main.js'])}\n`,
  );
}

/** Runs a standalone browser check with PostgreSQL in Docker and every other process on the host. */
async function runStandalonePlaywright(
  mode,
  { dryRun = false, playwrightArguments = [] } = {},
) {
  const context = readInstanceContext({ purpose: 'playwright' });
  if (dryRun) {
    const endpoints = startDatabaseInstance(context, {
      dryRun: true,
      print: false,
    });
    runHostNpmScript('build', endpoints.environment, { dryRun: true });
    printApplicationDryRun(endpoints.environment);
    runRawPlaywright(
      mode,
      { ...endpoints.environment, E2E_BASE_URL: '<dynamic-host-url>' },
      { dryRun: true, playwrightArguments },
    );
    stopDatabaseInstance(context, { dryRun: true, removeVolume: true });
    return 0;
  }

  let application;
  let succeeded = false;
  try {
    const endpoints = withLifecycleLock(
      context.lockRoot,
      context.projectName,
      () => startDatabaseInstance(context),
    );
    runHostNpmScript('build', endpoints.environment);
    application = await startLocalApplication({
      command: process.execPath,
      args: ['dist/api/main.js'],
      cwd: PROJECT_ROOT,
      environment: endpoints.environment,
    });
    runRawPlaywright(
      mode,
      { ...endpoints.environment, E2E_BASE_URL: application.baseUrl },
      { playwrightArguments },
    );
    await application.stop();
    application = undefined;
    withLifecycleLock(context.lockRoot, context.projectName, () =>
      stopDatabaseInstance(context, { removeVolume: true }),
    );
    succeeded = true;
    return 0;
  } finally {
    if (application) await application.stop();
    if (!succeeded) {
      process.stderr.write(
        `Playwright 验证失败，PostgreSQL 现场已保留：${context.projectName}\n`,
      );
    }
  }
}

/** Executes browser checks without fixed host-port fallbacks. */
export async function runPlaywrightCommand(
  argumentsFromCli,
  environment = process.env,
) {
  try {
    assertSupportedRuntimeVersions();
  } catch (error) {
    process.stderr.write(`错误：${error.message}\n`);
    return 1;
  }
  let options;
  try {
    options = parseArguments(argumentsFromCli);
  } catch (error) {
    process.stderr.write(`错误：${error.message}\n`);
    return 64;
  }
  try {
    const baseUrl = environment.E2E_BASE_URL?.trim();
    if (baseUrl) {
      runRawPlaywright(options.mode, environment, options);
      return 0;
    }
    return await runStandalonePlaywright(options.mode, options);
  } catch (error) {
    process.stderr.write(
      `错误：${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await runPlaywrightCommand(process.argv.slice(2));
}
