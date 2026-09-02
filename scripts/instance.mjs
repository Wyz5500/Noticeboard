/** Manages isolated PostgreSQL, migration, seed, and application Compose instances per worktree. */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withLifecycleLock } from './lifecycle-lock.mjs';
import { assertSupportedNodeVersion } from './runtime-version.mjs';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const COMPOSE_FILE = resolve(PROJECT_ROOT, 'compose.yaml');
const DATABASE_USER = 'noticeboard';
const DATABASE_PASSWORD = 'noticeboard';
const DATABASE_NAME = 'noticeboard';
const RESERVED_APP_PORT = 3000;
const MAX_PORT_ALLOCATION_ATTEMPTS = 3;
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** Converts worktree path text into a lowercase Docker-compatible identifier part. */
export function normalizeInstancePart(value) {
  const normalized = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'instance';
}

/** Creates a bounded, readable, and collision-resistant Compose project name. */
export function createInstanceProjectName({ worktreePath }) {
  const worktreePart = normalizeInstancePart(basename(worktreePath)).slice(
    0,
    24,
  );
  const fingerprint = createHash('sha256')
    .update(resolve(worktreePath))
    .digest('hex')
    .slice(0, 12);
  return `noticeboard-${worktreePart}-${fingerprint}`;
}

/** Creates the dedicated Compose project name used by standalone browser checks. */
export function createPlaywrightProjectName(instanceProjectName) {
  return `${instanceProjectName.slice(0, 52)}-playwright`;
}

/** Creates the predictable project-scoped PostgreSQL volume name for one instance. */
export function createInstanceVolumeName(projectName) {
  return `${projectName}_postgres-data`;
}

/** Builds the common Docker Compose argument prefix that scopes every command to one instance. */
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
  const port = match ? Number(match[1]) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`无法解析 Docker 发布端口：${output.trim() || '空输出'}`);
  }
  return port;
}

/** Reports whether a dynamically published app port conflicts with permanent deployment. */
export function isReservedAppPort(port) {
  return port === RESERVED_APP_PORT;
}

/** Creates the environment passed to database, API, and browser checks for one instance. */
export function createInstanceEnvironment(appPort, databasePort) {
  return {
    DATABASE_URL_TEST: `postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@127.0.0.1:${databasePort}/${DATABASE_NAME}`,
    E2E_BASE_URL: `http://127.0.0.1:${appPort}`,
  };
}

/** Creates empty host-port overrides so worktree Compose commands request dynamic ports. */
export function createInstanceComposeEnvironment() {
  return {
    APP_HOST_PORT: '',
    POSTGRES_HOST_PORT: '',
  };
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

/** Returns the current worktree identity and the repository-shared lock directory. */
function readGitContext({ playwright = false } = {}) {
  const worktreePath = runCaptured('git', [
    'rev-parse',
    '--show-toplevel',
  ]).trim();
  const commonDirectory = runCaptured('git', [
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ]).trim();
  const instanceProjectName = createInstanceProjectName({ worktreePath });
  return {
    worktreePath,
    projectName: playwright
      ? createPlaywrightProjectName(instanceProjectName)
      : instanceProjectName,
    lockRoot: resolve(commonDirectory, 'noticeboard-lifecycle-locks'),
  };
}

/** Formats a command for an actionable dry-run message. */
function formatCommand(command, args) {
  return [command, ...args]
    .map((argument) =>
      /^[a-zA-Z0-9_./:=+-]+$/.test(argument) ? argument : `'${argument}'`,
    )
    .join(' ');
}

/** Formats the dynamic port environment used by isolated Compose commands. */
function formatComposeEnvironment() {
  return Object.entries(createInstanceComposeEnvironment())
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
}

/** Runs a Docker CLI command with dynamic-port overrides. */
function runDocker(commandArguments, { capture = false, dryRun = false } = {}) {
  if (dryRun) {
    process.stdout.write(
      `DRY RUN: ${formatCommand('docker', commandArguments)}\n`,
    );
    return '';
  }
  const result = spawnSync('docker', commandArguments, {
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

/** Runs Docker Compose against exactly one worktree-scoped project. */
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
  return runDocker(args, { capture });
}

/** Reads the host port published for one Compose service. */
function readPublishedPort(context, service, containerPort) {
  return parsePublishedPort(
    runCompose(context, ['port', service, String(containerPort)], {
      capture: true,
    }),
  );
}

/** Reads all test endpoints from a running worktree instance. */
function readInstanceEnvironment(context) {
  const appPort = readPublishedPort(context, 'app', 3000);
  const databasePort = readPublishedPort(context, 'postgres', 5432);
  return {
    appPort,
    databasePort,
    environment: createInstanceEnvironment(appPort, databasePort),
  };
}

/** Prints the running instance status and all host addresses needed for checks. */
function printStatus(context, { dryRun = false, endpoints } = {}) {
  runCompose(context, ['ps'], { dryRun });
  if (dryRun) {
    runCompose(context, ['port', 'app', '3000'], { dryRun });
    runCompose(context, ['port', 'postgres', '5432'], { dryRun });
    return;
  }
  const currentEndpoints = endpoints ?? readInstanceEnvironment(context);
  process.stdout.write(`\n实例：${context.projectName}\n`);
  process.stdout.write(`页面：http://127.0.0.1:${currentEndpoints.appPort}\n`);
  process.stdout.write(
    `Swagger：http://127.0.0.1:${currentEndpoints.appPort}/api/docs\n`,
  );
  process.stdout.write(
    `数据库：${currentEndpoints.environment.DATABASE_URL_TEST}\n`,
  );
}

/** Removes one worktree instance and optionally its temporary database volume. */
function stopInstance(context, { dryRun = false, removeVolume = false } = {}) {
  const argumentsToRun = ['down'];
  if (removeVolume) argumentsToRun.push('-v');
  argumentsToRun.push('--remove-orphans');
  runCompose(context, argumentsToRun, { dryRun });
}

/** Starts an isolated stack and rejects Docker allocations that use deployment port 3000. */
function startInstance(context, { dryRun = false, print = true } = {}) {
  if (dryRun) {
    runCompose(context, ['up', '-d', '--build', '--wait'], { dryRun: true });
    if (print) printStatus(context, { dryRun: true });
    return undefined;
  }
  const endpoints = withLifecycleLock(
    context.lockRoot,
    'dynamic-port-allocation',
    () => {
      for (
        let attempt = 1;
        attempt <= MAX_PORT_ALLOCATION_ATTEMPTS;
        attempt += 1
      ) {
        runCompose(context, ['up', '-d', '--build', '--wait']);
        const currentEndpoints = readInstanceEnvironment(context);
        if (!isReservedAppPort(currentEndpoints.appPort))
          return currentEndpoints;
        process.stderr.write(
          `Docker 为 ${context.projectName} 分配了保留端口 3000，正在重新分配。\n`,
        );
        stopInstance(context);
      }
      throw new Error(
        `无法为 ${context.projectName} 分配避开 3000 的动态应用端口`,
      );
    },
  );
  if (print) printStatus(context, { endpoints });
  return endpoints;
}

/** Runs one quality-gate command with the instance's database and browser endpoints. */
function runQualityCommand(script, environment, { dryRun = false } = {}) {
  const args = ['run', script];
  if (dryRun) {
    process.stdout.write(`DRY RUN: ${formatCommand('npm', args)}\n`);
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

/** Runs the repository whitespace check as the final quality gate. */
function runGitDiffCheck({ dryRun = false } = {}) {
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

const QUALITY_SCRIPTS = [
  'format:check',
  'lint',
  'typecheck',
  'comments',
  'architecture',
  'test:instance',
  'test:unit',
  'test:api',
  'test:contract',
  'test:e2e',
  'test:visual',
];

/** Runs the full quality gate and always removes successful validation data. */
function verifyInstance(context, { dryRun = false } = {}) {
  if (dryRun) {
    startInstance(context, { dryRun: true });
    for (const script of QUALITY_SCRIPTS) {
      runQualityCommand(script, {}, { dryRun: true });
    }
    runGitDiffCheck({ dryRun: true });
    stopInstance(context, { dryRun: true, removeVolume: true });
    return 0;
  }
  const endpoints = startInstance(context);
  for (const script of QUALITY_SCRIPTS) {
    runQualityCommand(script, endpoints.environment);
  }
  runGitDiffCheck();
  stopInstance(context, { removeVolume: true });
  return 0;
}

/** Returns the raw Playwright arguments for one public browser test command. */
export function createPlaywrightArguments(mode, additionalArguments = []) {
  if (mode === 'e2e') {
    return ['test', '--grep-invert', '@visual', ...additionalArguments];
  }
  if (mode === 'visual') {
    return ['test', '--grep', '@visual', ...additionalArguments];
  }
  throw new Error(`未知 Playwright 模式：${mode}`);
}

/** Runs Playwright through the local package binary with an injected instance environment. */
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

/** Runs a standalone browser check in its own worktree-scoped dynamic instance. */
export function runStandalonePlaywright(
  mode,
  { dryRun = false, playwrightArguments = [] } = {},
) {
  const context = readGitContext({ playwright: true });
  if (dryRun) {
    startInstance(context, { dryRun: true, print: false });
    runRawPlaywright(mode, {}, { dryRun: true, playwrightArguments });
    stopInstance(context, { dryRun: true, removeVolume: true });
    return 0;
  }
  return withLifecycleLock(context.lockRoot, context.projectName, () => {
    const endpoints = startInstance(context);
    runRawPlaywright(mode, endpoints.environment, { playwrightArguments });
    stopInstance(context, { removeVolume: true });
    return 0;
  });
}

/** Prints the supported worktree lifecycle commands. */
function printUsage() {
  process.stdout.write(
    `用法：npm run instance -- <命令> [选项]\n\n命令：\n  up                 启动当前 worktree 的完整 Compose 栈\n  status             显示容器状态、访问地址和数据库连接信息\n  down               移除容器和网络，保留数据库卷\n  destroy --yes      移除当前实例的容器、网络和数据库卷\n  verify             执行完整验证；成功删除临时资源，失败保留现场\n\n通用选项：\n  --dry-run          只打印命令，不连接 Docker\n  --help             显示此帮助信息\n`,
  );
}

/** Identifies command-line usage errors with shell-friendly exit code 64. */
class CliUsageError extends Error {}

/** Parses one worktree lifecycle command and its safety-sensitive flags. */
function parseArguments(argumentsFromCli) {
  if (argumentsFromCli[0] === '--help' || argumentsFromCli[0] === '-h') {
    return { command: 'help' };
  }
  const [command = 'help', ...flags] = argumentsFromCli;
  const allowedCommands = new Set([
    'up',
    'status',
    'down',
    'destroy',
    'verify',
    'help',
  ]);
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

/** Executes a worktree lifecycle command and returns its process exit code. */
export function runInstanceCommand(argumentsFromCli) {
  try {
    assertSupportedNodeVersion();
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
    context = readGitContext();
    if (options.command === 'status') {
      printStatus(context, options);
      return 0;
    }
    const runCommand = () => {
      if (options.command === 'up') startInstance(context, options);
      if (options.command === 'down') stopInstance(context, options);
      if (options.command === 'destroy') {
        stopInstance(context, { ...options, removeVolume: true });
      }
      if (options.command === 'verify') return verifyInstance(context, options);
      return 0;
    };
    if (options.dryRun) return runCommand();
    return withLifecycleLock(context.lockRoot, context.projectName, runCommand);
  } catch (error) {
    process.stderr.write(
      `错误：${error instanceof Error ? error.message : String(error)}\n`,
    );
    if (options.command === 'verify' && context && !options.dryRun) {
      process.stderr.write(
        `验证失败，现场已保留。检查：docker compose -f compose.yaml -p ${context.projectName} ps\n日志：docker compose -f compose.yaml -p ${context.projectName} logs\n清理：npm run instance -- destroy --yes\n`,
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
