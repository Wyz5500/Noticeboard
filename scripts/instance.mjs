/** Manages one isolated PostgreSQL, migration, seed, and application Compose instance per worktree. */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const COMPOSE_FILE = resolve(PROJECT_ROOT, 'compose.yaml');
const DATABASE_USER = 'noticeboard';
const DATABASE_PASSWORD = 'noticeboard';
const DATABASE_NAME = 'noticeboard';
const LEGACY_VOLUME_NAME = 'noticeboard-postgres';
const POSTGRES_IMAGE = 'postgres:18.6-alpine';
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const LEGACY_MIGRATION_MARKER_PREFIX = '/.noticeboard-migrated-';

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

/** Creates the predictable project-scoped PostgreSQL volume name for one instance. */
export function createInstanceVolumeName(projectName) {
  return `${projectName}_postgres-data`;
}

/** Creates the marker path that records one worktree's legacy-volume import. */
export function createLegacyMigrationMarkerPath(projectName) {
  return `${LEGACY_MIGRATION_MARKER_PREFIX}${projectName}`;
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

/** Creates the environment passed to database, API, and browser checks for one instance. */
export function createInstanceEnvironment(appPort, databasePort) {
  return {
    DATABASE_URL_TEST: `postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@127.0.0.1:${databasePort}/${DATABASE_NAME}`,
    E2E_BASE_URL: `http://127.0.0.1:${appPort}`,
  };
}

/** Creates empty host-port overrides so only isolated Compose instances use dynamic ports. */
export function createInstanceComposeEnvironment() {
  return {
    APP_HOST_PORT: '',
    POSTGRES_HOST_PORT: '',
  };
}

/** Returns the current worktree's branch and root identity from Git. */
function readGitContext() {
  const branch = runCaptured(
    'git',
    ['branch', '--show-current'],
    PROJECT_ROOT,
  ).trim();
  const worktreePath = runCaptured(
    'git',
    ['rev-parse', '--show-toplevel'],
    PROJECT_ROOT,
  ).trim();
  return {
    branch,
    worktreePath,
    projectName: createInstanceProjectName({ worktreePath }),
  };
}

/** Reads a successful command's stdout or throws a useful process error. */
function runCaptured(command, args, cwd) {
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

/** Runs a Docker CLI command with optional output capture or dry-run rendering. */
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

/** Runs Docker Compose with the selected instance project and optional output capture. */
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
  const result = runDocker(args, { capture });
  return result;
}

/** Runs a silent Docker probe and reports whether it completed successfully. */
function dockerCommandSucceeds(commandArguments) {
  const result = spawnSync('docker', commandArguments, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...createInstanceComposeEnvironment() },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  if (result.error) throw result.error;
  return result.status === 0;
}

/** Checks whether a Docker volume exists without treating a missing volume as an error. */
function hasDockerVolume(volumeName) {
  return dockerCommandSucceeds(['volume', 'inspect', volumeName]);
}

/** Checks whether one worktree has already imported the retained legacy volume. */
function hasLegacyMigrationMarker(projectName) {
  return dockerCommandSucceeds([
    'run',
    '--rm',
    '--user',
    'root',
    '--entrypoint',
    'sh',
    '-v',
    `${LEGACY_VOLUME_NAME}:/legacy:ro`,
    POSTGRES_IMAGE,
    '-c',
    `test -e /legacy${createLegacyMigrationMarkerPath(projectName)}`,
  ]);
}

/** Builds the Docker command that records a completed or intentionally skipped import. */
function createLegacyMigrationMarkerCommand(projectName) {
  return [
    'run',
    '--rm',
    '--user',
    'root',
    '--entrypoint',
    'sh',
    '-v',
    `${LEGACY_VOLUME_NAME}:/legacy`,
    POSTGRES_IMAGE,
    '-c',
    `touch /legacy${createLegacyMigrationMarkerPath(projectName)}`,
  ];
}

/** Records that one worktree has completed its legacy-volume import. */
function markLegacyVolumeMigrated(projectName) {
  runDocker(createLegacyMigrationMarkerCommand(projectName));
}

/** Prints or performs a one-time copy from the legacy shared volume into this instance. */
function migrateLegacyVolume(context, { dryRun = false } = {}) {
  const targetVolume = createInstanceVolumeName(context.projectName);
  const markerPath = createLegacyMigrationMarkerPath(context.projectName);
  if (dryRun) {
    runDocker(['volume', 'inspect', LEGACY_VOLUME_NAME], { dryRun: true });
    runDocker(
      [
        'run',
        '--rm',
        '--user',
        'root',
        '--entrypoint',
        'sh',
        '-v',
        `${LEGACY_VOLUME_NAME}:/legacy:ro`,
        POSTGRES_IMAGE,
        '-c',
        `test ! -e /legacy${markerPath}`,
      ],
      { dryRun: true },
    );
    runCompose({ projectName: 'noticeboard' }, ['down', '--remove-orphans'], {
      dryRun: true,
    });
    runDocker(['volume', 'inspect', targetVolume], { dryRun: true });
    runCompose(context, ['down', '-v', '--remove-orphans'], {
      dryRun: true,
    });
    runDocker(['volume', 'rm', targetVolume], { dryRun: true });
    runCompose(context, ['create', 'postgres'], { dryRun: true });
    runDocker(
      [
        'run',
        '--rm',
        '--user',
        'root',
        '--entrypoint',
        'sh',
        '-v',
        `${LEGACY_VOLUME_NAME}:/from:ro`,
        '-v',
        `${targetVolume}:/to`,
        POSTGRES_IMAGE,
        '-c',
        'cp -a /from/. /to/',
      ],
      { dryRun: true },
    );
    runDocker(
      [
        'run',
        '--rm',
        '--user',
        'root',
        '--entrypoint',
        'sh',
        '-v',
        `${LEGACY_VOLUME_NAME}:/legacy`,
        POSTGRES_IMAGE,
        '-c',
        `touch /legacy${markerPath}`,
      ],
      { dryRun: true },
    );
    return;
  }
  if (!hasDockerVolume(LEGACY_VOLUME_NAME)) return;
  if (hasLegacyMigrationMarker(context.projectName)) return;
  if (hasDockerVolume(targetVolume)) {
    runCompose(context, ['down', '-v', '--remove-orphans']);
    if (hasDockerVolume(targetVolume)) {
      runDocker(['volume', 'rm', targetVolume]);
    }
  }
  process.stdout.write(
    `检测到旧数据库卷 ${LEGACY_VOLUME_NAME}，迁移到 ${targetVolume}。\n`,
  );
  runCompose({ projectName: 'noticeboard' }, ['down', '--remove-orphans']);
  runCompose(context, ['create', 'postgres']);
  runDocker([
    'run',
    '--rm',
    '--user',
    'root',
    '--entrypoint',
    'sh',
    '-v',
    `${LEGACY_VOLUME_NAME}:/from:ro`,
    '-v',
    `${targetVolume}:/to`,
    POSTGRES_IMAGE,
    '-c',
    'cp -a /from/. /to/',
  ]);
  markLegacyVolumeMigrated(context.projectName);
}

/** Reads the host port published for one Compose service. */
function readPublishedPort(context, service, containerPort) {
  return parsePublishedPort(
    runCompose(context, ['port', service, String(containerPort)], {
      capture: true,
    }),
  );
}

/** Prints the running instance status and all host addresses needed for local checks. */
function printStatus(context, { dryRun = false } = {}) {
  runCompose(context, ['ps'], { dryRun });
  if (dryRun) {
    runCompose(context, ['port', 'app', '3000'], { dryRun });
    runCompose(context, ['port', 'postgres', '5432'], { dryRun });
    return;
  }
  const appPort = readPublishedPort(context, 'app', 3000);
  const databasePort = readPublishedPort(context, 'postgres', 5432);
  const environment = createInstanceEnvironment(appPort, databasePort);
  process.stdout.write(`\n实例：${context.projectName}\n`);
  process.stdout.write(`页面：http://127.0.0.1:${appPort}\n`);
  process.stdout.write(`Swagger：http://127.0.0.1:${appPort}/api/docs\n`);
  process.stdout.write(`数据库：${environment.DATABASE_URL_TEST}\n`);
}

/** Starts the complete database migration, seed, and application stack. */
function startInstance(context, { dryRun = false } = {}) {
  migrateLegacyVolume(context, { dryRun });
  runCompose(context, ['up', '-d', '--build', '--wait'], { dryRun });
  if (!dryRun) printStatus(context);
}

/** Removes one instance's containers and network while preserving its volume. */
function stopInstance(context, { dryRun = false, removeVolume = false } = {}) {
  const argumentsToRun = ['down'];
  if (removeVolume) argumentsToRun.push('-v');
  argumentsToRun.push('--remove-orphans');
  runCompose(context, argumentsToRun, { dryRun });
}

/** Prevents a destructive reset from importing the retained legacy database again. */
function destroyInstance(context, { dryRun = false } = {}) {
  if (dryRun) {
    runDocker(['volume', 'inspect', LEGACY_VOLUME_NAME], { dryRun: true });
    runDocker(createLegacyMigrationMarkerCommand(context.projectName), {
      dryRun: true,
    });
  } else if (
    hasDockerVolume(LEGACY_VOLUME_NAME) &&
    !hasLegacyMigrationMarker(context.projectName)
  ) {
    markLegacyVolumeMigrated(context.projectName);
  }
  stopInstance(context, { dryRun, removeVolume: true });
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

/** Runs the repository whitespace check as the final non-Compose quality-gate command. */
function runGitDiffCheck({ dryRun = false } = {}) {
  const args = ['diff', '--check'];
  if (dryRun) {
    process.stdout.write(`DRY RUN: ${formatCommand('git', args)}\n`);
    return;
  }
  const result = spawnSync('git', args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git diff --check 失败（退出码 ${result.status ?? 1}）`);
  }
}

/** Runs the full project quality gate against the current isolated instance. */
function verifyInstance(context, { keep = false, dryRun = false } = {}) {
  if (dryRun) {
    startInstance(context, { dryRun: true });
    for (const script of QUALITY_SCRIPTS)
      runQualityCommand(script, {}, { dryRun: true });
    runGitDiffCheck({ dryRun: true });
    if (!keep) stopInstance(context, { dryRun: true });
    return 0;
  }

  startInstance(context);
  const appPort = readPublishedPort(context, 'app', 3000);
  const databasePort = readPublishedPort(context, 'postgres', 5432);
  const environment = createInstanceEnvironment(appPort, databasePort);
  for (const script of QUALITY_SCRIPTS) runQualityCommand(script, environment);
  runGitDiffCheck();
  if (!keep) stopInstance(context);
  return 0;
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

/** Prints the supported instance lifecycle commands. */
function printUsage() {
  process.stdout.write(`用法：npm run instance -- <命令> [选项]

命令：
  up                 启动当前 worktree 的完整 Compose 栈
  status             显示容器状态、访问地址和数据库连接信息
  down               移除容器和网络，保留数据库卷
  destroy --yes      移除当前实例的容器、网络和数据库卷
  verify [--keep]    在当前实例执行完整验证；失败时保留环境

通用选项：
  --dry-run          只打印命令，不连接 Docker
  --help             显示此帮助信息
`);
}

/** Parses one instance command and its safety-sensitive flags. */
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
  if (!allowedCommands.has(command))
    throw new CliUsageError(`未知命令：${command}`);
  const allowedFlags = new Set([
    '--dry-run',
    '--yes',
    '--keep',
    '--help',
    '-h',
  ]);
  for (const flag of flags) {
    if (!allowedFlags.has(flag)) throw new CliUsageError(`未知选项：${flag}`);
  }
  if (flags.includes('--help') || flags.includes('-h'))
    return { command: 'help' };
  if (command === 'destroy' && !flags.includes('--yes')) {
    throw new CliUsageError('destroy 是破坏性操作，必须显式提供 --yes');
  }
  if (command !== 'destroy' && flags.includes('--yes')) {
    throw new CliUsageError('--yes 只适用于 destroy');
  }
  if (command !== 'verify' && flags.includes('--keep')) {
    throw new CliUsageError('--keep 只适用于 verify');
  }
  return {
    command,
    dryRun: flags.includes('--dry-run'),
    keep: flags.includes('--keep'),
  };
}

/** Identifies command-line usage errors with the shell-friendly exit code 64. */
class CliUsageError extends Error {}

/** Executes an instance lifecycle command and returns its process exit code. */
export function runInstanceCommand(argumentsFromCli) {
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
    if (options.command === 'up') startInstance(context, options);
    if (options.command === 'status') printStatus(context, options);
    if (options.command === 'down') stopInstance(context, options);
    if (options.command === 'destroy') destroyInstance(context, options);
    if (options.command === 'verify') return verifyInstance(context, options);
    return 0;
  } catch (error) {
    process.stderr.write(
      `错误：${error instanceof Error ? error.message : String(error)}\n`,
    );
    if (options.command === 'verify' && context && !options.dryRun) {
      process.stderr.write(
        `验证失败，实例已保留。排查后可执行：npm run instance -- down\n或删除数据：npm run instance -- destroy --yes\n`,
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
