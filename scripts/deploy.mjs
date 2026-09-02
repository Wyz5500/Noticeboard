/** Deploys or upgrades the permanent noticeboard Compose project from the primary checkout. */
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withLifecycleLock } from './lifecycle-lock.mjs';
import { assertSupportedNodeVersion } from './runtime-version.mjs';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const COMPOSE_FILE = resolve(PROJECT_ROOT, 'compose.deploy.yaml');
const DEPLOY_PROJECT_NAME = 'noticeboard';

/** Reports whether Git's worktree-specific directory is the common primary directory. */
export function isPrimaryWorktreeGitDirectory(commonDirectory, gitDirectory) {
  return resolve(commonDirectory) === resolve(gitDirectory);
}

/** Formats one command for dry-run output. */
function formatCommand(command, argumentsToFormat) {
  return [command, ...argumentsToFormat]
    .map((argument) =>
      /^[a-zA-Z0-9_./:=+-]+$/.test(argument) ? argument : `'${argument}'`,
    )
    .join(' ');
}

/** Reads one successful command's stdout or raises its actionable error. */
function runCaptured(command, argumentsToRun) {
  const result = spawnSync(command, argumentsToRun, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() || `${command} 执行失败（退出码 ${result.status}）`,
    );
  }
  return result.stdout.trim();
}

/** Rejects deployment from linked worktrees before Docker can be contacted. */
function assertPrimaryWorktree() {
  const commonDirectory = runCaptured('git', [
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ]);
  const gitDirectory = runCaptured('git', [
    'rev-parse',
    '--path-format=absolute',
    '--git-dir',
  ]);
  if (!isPrimaryWorktreeGitDirectory(commonDirectory, gitDirectory)) {
    throw new Error(
      '禁止从 linked worktree 部署；请在主工作目录执行 npm run deploy',
    );
  }
  return commonDirectory;
}

/** Builds the single non-destructive permanent deployment command. */
export function createDeploymentArguments(composeFile = COMPOSE_FILE) {
  return [
    'compose',
    '-f',
    composeFile,
    '-p',
    DEPLOY_PROJECT_NAME,
    'up',
    '-d',
    '--build',
    '--wait',
  ];
}

/** Executes the single non-destructive deployment operation. */
function deploy({ dryRun }) {
  const commonDirectory = assertPrimaryWorktree();
  const argumentsToRun = createDeploymentArguments();
  if (dryRun) {
    process.stdout.write(
      `DRY RUN: ${formatCommand('docker', argumentsToRun)}\n`,
    );
    return;
  }
  const lockRoot = resolve(commonDirectory, 'noticeboard-lifecycle-locks');
  withLifecycleLock(lockRoot, 'dynamic-port-allocation', () => {
    withLifecycleLock(lockRoot, DEPLOY_PROJECT_NAME, () => {
      const result = spawnSync('docker', argumentsToRun, {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
      });
      if (result.error) throw result.error;
      if (result.status !== 0) {
        throw new Error(`Docker 部署失败（退出码 ${result.status ?? 1}）`);
      }
    });
  });
  process.stdout.write('noticeboard 已部署或升级：http://127.0.0.1:3000\n');
}

/** Prints the permanent deployment command contract. */
function printUsage() {
  process.stdout.write(
    `用法：npm run deploy -- [选项]\n\n选项：\n  --dry-run  只打印升级命令，不连接 Docker\n  --help     显示此帮助信息\n`,
  );
}

/** Parses the deliberately small, non-destructive deployment interface. */
function parseArguments(argumentsFromCli) {
  let dryRun = false;
  for (const argument of argumentsFromCli) {
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--dry-run' && !dryRun) {
      dryRun = true;
      continue;
    }
    throw new Error(`未知选项或多余参数：${argument}`);
  }
  return { dryRun };
}

/** Runs the deployment CLI and returns a shell-compatible exit code. */
export function runDeployCommand(argumentsFromCli) {
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
    process.stderr.write(`错误：${error.message}\n`);
    printUsage();
    return 64;
  }
  if (options.help) {
    printUsage();
    return 0;
  }
  try {
    deploy(options);
    return 0;
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
  process.exitCode = runDeployCommand(process.argv.slice(2));
}
