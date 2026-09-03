/** Prepares a worktree database and runs the development application on the host. */
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatCommand,
  readInstanceContext,
  runHostNpmScript,
  startDatabaseInstance,
} from './instance.mjs';
import { withLifecycleLock } from './lifecycle-lock.mjs';
import { startLocalApplication } from './local-app.mjs';
import { assertSupportedRuntimeVersions } from './runtime-version.mjs';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const WATCH_ARGUMENTS = [
  'exec',
  '--',
  'tsx',
  '--tsconfig',
  'apps/api/tsconfig.json',
  '--watch',
  'apps/api/src/main.ts',
];

/** Parses the deliberately small host-development command interface. */
function parseArguments(argumentsFromCli) {
  if (argumentsFromCli.length === 0) return { dryRun: false };
  if (argumentsFromCli.length === 1 && argumentsFromCli[0] === '--dry-run') {
    return { dryRun: true };
  }
  if (
    argumentsFromCli.length === 1 &&
    (argumentsFromCli[0] === '--help' || argumentsFromCli[0] === '-h')
  ) {
    return { help: true };
  }
  throw new Error(`未知选项或多余参数：${argumentsFromCli.join(' ')}`);
}

/** Prints the host-development command contract. */
function printUsage() {
  process.stdout.write(
    '用法：npm run start:dev -- [--dry-run]\n\n准备当前 worktree 的 PostgreSQL，并在宿主机启动 TypeScript watcher。\n',
  );
}

/** Prints the host watcher command without starting a child process. */
function printWatcherDryRun(environment) {
  const environmentPrefix = Object.entries({
    ...environment,
    HOST: '127.0.0.1',
    PORT: '0',
  })
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  process.stdout.write(
    `DRY RUN: ${environmentPrefix} ${formatCommand('npm', WATCH_ARGUMENTS)}\n`,
  );
}

/** Runs the development database preparation and host watcher lifecycle. */
async function runLocalDevelopment({ dryRun }) {
  const context = readInstanceContext({ purpose: 'dev' });
  const endpoints = dryRun
    ? startDatabaseInstance(context, { dryRun: true, print: false })
    : withLifecycleLock(context.lockRoot, context.projectName, () =>
        startDatabaseInstance(context),
      );
  runHostNpmScript('build:web', endpoints.environment, { dryRun });
  if (dryRun) {
    printWatcherDryRun(endpoints.environment);
    return 0;
  }

  const application = await startLocalApplication({
    command: NPM_COMMAND,
    args: WATCH_ARGUMENTS,
    cwd: PROJECT_ROOT,
    environment: endpoints.environment,
  });
  process.stdout.write(`本机开发应用：${application.baseUrl}\n`);

  let stopping = false;
  /** Stops the watcher once when the terminal requests shutdown. */
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void application.stop();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  await once(application.child, 'exit');
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
  return application.child.exitCode ?? 0;
}

/** Runs the local-development CLI and returns a shell-compatible exit code. */
export async function runLocalCommand(argumentsFromCli) {
  try {
    assertSupportedRuntimeVersions();
    const options = parseArguments(argumentsFromCli);
    if (options.help) {
      printUsage();
      return 0;
    }
    return await runLocalDevelopment(options);
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
  process.exitCode = await runLocalCommand(process.argv.slice(2));
}
