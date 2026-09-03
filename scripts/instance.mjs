/** Manages purpose-scoped PostgreSQL containers while all application work runs on the host. */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withLifecycleLock } from './lifecycle-lock.mjs';
import { assertSupportedRuntimeVersions } from './runtime-version.mjs';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const COMPOSE_FILE = resolve(PROJECT_ROOT, 'compose.yaml');
const DATABASE_USER = 'noticeboard';
const DATABASE_PASSWORD = 'noticeboard';
const DATABASE_NAME = 'noticeboard';
const TASK_BUSINESS_TIME_ZONE = 'Asia/Shanghai';
const TASK_CURRENT_DATE_OVERRIDE = '2026-09-01';
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const INSTANCE_PURPOSES = new Set(['dev', 'verify', 'playwright']);

/** Converts worktree path text into a lowercase Docker-compatible identifier part. */
export function normalizeInstancePart(value) {
  const normalized = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'instance';
}

/** Creates one bounded project name isolated by worktree path and lifecycle purpose. */
export function createInstanceProjectName({ worktreePath, purpose = 'dev' }) {
  if (!INSTANCE_PURPOSES.has(purpose)) {
    throw new Error(`未知实例用途：${purpose}`);
  }
  const worktreePart = normalizeInstancePart(basename(worktreePath)).slice(
    0,
    24,
  );
  const fingerprint = createHash('sha256')
    .update(resolve(worktreePath))
    .digest('hex')
    .slice(0, 12);
  return `noticeboard-${worktreePart}-${fingerprint}-${purpose}`;
}

/** Creates the predictable project-scoped PostgreSQL volume name for one database. */
export function createInstanceVolumeName(projectName) {
  return `${projectName}_postgres-data`;
}

/** Builds the Docker Compose argument prefix that scopes one database project. */
export function createComposeArguments(
  composeFile,
  projectName,
  commandArguments,
) {
  return ['compose', '-f', composeFile, '-p', projectName, ...commandArguments];
}

/** Extracts a published host port from Docker Compose output. */
export function parsePublishedPort(output) {
  const match = output.trim().match(/:(\d+)$/);
  const port = match ? Number(match[1]) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`无法解析 Docker 发布端口：${output.trim() || '空输出'}`);
  }
  return port;
}

/** Creates host-process variables for one dynamically published PostgreSQL database. */
export function createInstanceEnvironment(databasePort) {
  const databaseUrl = `postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@127.0.0.1:${databasePort}/${DATABASE_NAME}`;
  return {
    DATABASE_URL: databaseUrl,
    DATABASE_URL_TEST: databaseUrl,
    TASK_BUSINESS_TIME_ZONE,
    TASK_CURRENT_DATE_OVERRIDE,
  };
}

/** Creates the only environment override accepted by local Compose. */
export function createInstanceComposeEnvironment() {
  return { POSTGRES_HOST_PORT: '' };
}

/** Reads a successful command's stdout or throws a useful process error. */
function runCaptured(command, args, cwd = PROJECT_ROOT) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() || `${command} 执行失败（退出码 ${result.status}）`,
    );
  }
  return result.stdout;
}

/** Returns the current worktree identity and repository-shared lock directory. */
export function readInstanceContext({ purpose = 'dev' } = {}) {
  const worktreePath = runCaptured('git', [
    'rev-parse',
    '--show-toplevel',
  ]).trim();
  const commonDirectory = runCaptured('git', [
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ]).trim();
  return {
    worktreePath,
    purpose,
    projectName: createInstanceProjectName({ worktreePath, purpose }),
    lockRoot: resolve(commonDirectory, 'noticeboard-lifecycle-locks'),
  };
}

/** Formats a command for dry-run and diagnostic output. */
export function formatCommand(command, args) {
  return [command, ...args]
    .map((argument) =>
      /^[a-zA-Z0-9_./:=+<>-]+$/.test(argument) ? argument : `'${argument}'`,
    )
    .join(' ');
}

/** Formats the dynamic PostgreSQL port override for Compose output. */
function formatComposeEnvironment() {
  return Object.entries(createInstanceComposeEnvironment())
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
}

/** Runs Docker Compose against exactly one purpose-scoped PostgreSQL project. */
function runCompose(
  context,
  commandArguments,
  { capture = false, dryRun = false } = {},
) {
  const args = createComposeArguments(
    COMPOSE_FILE,
    context.projectName,
    commandArguments,
  );
  if (dryRun) {
    process.stdout.write(
      `DRY RUN: ${formatComposeEnvironment()} ${formatCommand('docker', args)}\n`,
    );
    return '';
  }
  const result = spawnSync('docker', args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...createInstanceComposeEnvironment() },
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = capture ? result.stderr.trim() : '';
    throw new Error(details || `Docker 执行失败（退出码 ${result.status}）`);
  }
  return capture ? result.stdout : '';
}

/** Runs one npm script on the host with the supplied database and application variables. */
export function runHostNpmScript(
  script,
  environment,
  { dryRun = false, scriptArguments = [] } = {},
) {
  const args = ['run', script];
  if (scriptArguments.length > 0) args.push('--', ...scriptArguments);
  if (dryRun) {
    const environmentPrefix = Object.entries(environment)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    process.stdout.write(
      `DRY RUN: ${environmentPrefix ? `${environmentPrefix} ` : ''}${formatCommand('npm', args)}\n`,
    );
    return;
  }
  const result = spawnSync(NPM_COMMAND, args, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...environment },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm run ${script} 失败（退出码 ${result.status ?? 1}）`);
  }
}

/** Reads the current host URL for one running PostgreSQL service. */
function readDatabaseEnvironment(context) {
  const databasePort = parsePublishedPort(
    runCompose(context, ['port', 'postgres', '5432'], { capture: true }),
  );
  return {
    databasePort,
    environment: createInstanceEnvironment(databasePort),
  };
}

/** Prints PostgreSQL status and its host connection information. */
export function printDatabaseStatus(
  context,
  { dryRun = false, endpoints } = {},
) {
  runCompose(context, ['ps', 'postgres'], { dryRun });
  if (dryRun) {
    runCompose(context, ['port', 'postgres', '5432'], { dryRun });
    return;
  }
  const currentEndpoints = endpoints ?? readDatabaseEnvironment(context);
  process.stdout.write(`\n数据库实例：${context.projectName}\n`);
  process.stdout.write(
    `数据库：${currentEndpoints.environment.DATABASE_URL}\n`,
  );
}

/** Starts PostgreSQL and prepares its schema and seed from host Node processes. */
export function startDatabaseInstance(
  context,
  { dryRun = false, print = true } = {},
) {
  runCompose(context, ['up', '-d', '--wait', 'postgres'], { dryRun });
  if (dryRun) {
    runCompose(context, ['port', 'postgres', '5432'], { dryRun: true });
    const environment = createInstanceEnvironment('<dynamic-postgres-port>');
    runHostNpmScript('db:migrate', environment, { dryRun: true });
    runHostNpmScript('db:seed', environment, { dryRun: true });
    return { databasePort: undefined, environment };
  }
  const endpoints = readDatabaseEnvironment(context);
  runHostNpmScript('db:migrate', endpoints.environment);
  runHostNpmScript('db:seed', endpoints.environment);
  if (print) printDatabaseStatus(context, { endpoints });
  return endpoints;
}

/** Stops one PostgreSQL project and optionally removes its temporary volume. */
export function stopDatabaseInstance(
  context,
  { dryRun = false, removeVolume = false } = {},
) {
  const argumentsToRun = ['down'];
  if (removeVolume) argumentsToRun.push('-v');
  argumentsToRun.push('--remove-orphans');
  runCompose(context, argumentsToRun, { dryRun });
}

/** Runs the repository whitespace check as a host-side quality gate. */
export function runGitDiffCheck({ dryRun = false } = {}) {
  const args = ['diff', '--check'];
  if (dryRun) {
    process.stdout.write(`DRY RUN: ${formatCommand('git', args)}\n`);
    return;
  }
  const result = spawnSync('git', args, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git diff --check 失败（退出码 ${result.status ?? 1}）`);
  }
}

/** Prints the supported development database lifecycle commands. */
function printUsage() {
  process.stdout.write(
    `用法：npm run instance -- <命令> [选项]\n\n当前 worktree 的开发数据库命令：\n  up                 启动 PostgreSQL，并在宿主机执行 migration 与 seed\n  status             显示 PostgreSQL 状态和数据库连接信息\n  down               移除容器和网络，保留数据库卷\n  destroy --yes      移除容器、网络和数据库卷\n\n通用选项：\n  --dry-run          只打印命令，不连接 Docker\n  --help             显示此帮助信息\n`,
  );
}

/** Identifies command-line usage errors with shell-friendly exit code 64. */
class CliUsageError extends Error {}

/** Parses one development database command and its safety-sensitive flags. */
function parseArguments(argumentsFromCli) {
  if (argumentsFromCli[0] === '--help' || argumentsFromCli[0] === '-h') {
    return { command: 'help' };
  }
  const [command = 'help', ...flags] = argumentsFromCli;
  const allowedCommands = new Set(['up', 'status', 'down', 'destroy', 'help']);
  if (!allowedCommands.has(command)) {
    throw new CliUsageError(`未知命令：${command}`);
  }
  const allowedFlags = new Set(['--dry-run', '--yes', '--help', '-h']);
  for (const flag of flags) {
    if (!allowedFlags.has(flag)) throw new CliUsageError(`未知选项：${flag}`);
  }
  if (flags.includes('--help') || flags.includes('-h')) {
    return { command: 'help' };
  }
  if (command === 'destroy' && !flags.includes('--yes')) {
    throw new CliUsageError('destroy 是破坏性操作，必须显式提供 --yes');
  }
  if (command !== 'destroy' && flags.includes('--yes')) {
    throw new CliUsageError('--yes 只适用于 destroy');
  }
  return { command, dryRun: flags.includes('--dry-run') };
}

/** Executes one development database command and returns its process exit code. */
export function runInstanceCommand(argumentsFromCli) {
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
    process.stderr.write(
      `错误：${error instanceof Error ? error.message : String(error)}\n`,
    );
    printUsage();
    return 64;
  }
  if (options.command === 'help') {
    printUsage();
    return 0;
  }

  let context;
  try {
    context = readInstanceContext({ purpose: 'dev' });
    if (options.command === 'status') {
      printDatabaseStatus(context, options);
      return 0;
    }
    const runCommand = () => {
      if (options.command === 'up') startDatabaseInstance(context, options);
      if (options.command === 'down') stopDatabaseInstance(context, options);
      if (options.command === 'destroy') {
        stopDatabaseInstance(context, { ...options, removeVolume: true });
      }
      return 0;
    };
    if (options.dryRun) return runCommand();
    return withLifecycleLock(context.lockRoot, context.projectName, runCommand);
  } catch (error) {
    process.stderr.write(
      `错误：${error instanceof Error ? error.message : String(error)}\n`,
    );
    if (context && !options.dryRun) {
      process.stderr.write(
        `数据库现场已保留。检查：docker compose -f compose.yaml -p ${context.projectName} ps postgres\n日志：docker compose -f compose.yaml -p ${context.projectName} logs postgres\n清理：npm run instance -- destroy --yes\n`,
      );
    }
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = runInstanceCommand(process.argv.slice(2));
}
