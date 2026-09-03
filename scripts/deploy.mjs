/** Deploys the permanent Compose project only from a clean primary main checkout. */
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withLifecycleLock } from './lifecycle-lock.mjs';
import { assertSupportedRuntimeVersions } from './runtime-version.mjs';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const COMPOSE_FILE = resolve(PROJECT_ROOT, 'compose.deploy.yaml');
const DEPLOY_PROJECT_NAME = 'noticeboard';
const DEPLOY_BASE_URL = 'http://127.0.0.1:3000';

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

/** Reads every local Git fact that gates permanent deployment. */
export function readDeploymentGitState() {
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
  const branchResult = spawnSync(
    'git',
    ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (branchResult.error) throw branchResult.error;
  const branch = branchResult.status === 0 ? branchResult.stdout.trim() : null;
  return {
    commonDirectory,
    gitDirectory,
    branch,
    status: runCaptured('git', ['status', '--porcelain']),
  };
}

/** Rejects deployment unless Git is a clean primary checkout on main. */
export function assertDeployableGitState(state) {
  if (
    !isPrimaryWorktreeGitDirectory(state.commonDirectory, state.gitDirectory)
  ) {
    throw new Error(
      '禁止从 linked worktree 部署；请在主工作目录的 main 分支执行 npm run deploy',
    );
  }
  if (state.branch === null) {
    throw new Error('detached HEAD 禁止永久部署；请切换到 main 分支');
  }
  if (state.branch !== 'main') {
    throw new Error(`永久部署只允许 main 分支，当前为 ${state.branch}`);
  }
  if (state.status) {
    throw new Error('永久部署要求工作区和暂存区均为 clean');
  }
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

/** Waits between readiness attempts without blocking the event loop. */
function defaultDelay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

/** Fetches one deployment endpoint with a bounded request timeout. */
function defaultFetchRequest(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(5_000),
  });
}

/** Requires one HTTP response to complete successfully. */
function assertSuccessfulResponse(response, label) {
  if (!response?.ok) {
    throw new Error(`${label}失败（HTTP ${response?.status ?? '无响应'}）`);
  }
}

/** Verifies database readiness, static assets, OpenAPI, and one database-backed read API. */
export async function runDeploymentSmokeChecks({
  baseUrl = DEPLOY_BASE_URL,
  fetchRequest = defaultFetchRequest,
  delay = defaultDelay,
  readinessAttempts = 20,
} = {}) {
  let ready = false;
  let lastStatus = '无响应';
  for (let attempt = 1; attempt <= readinessAttempts; attempt += 1) {
    try {
      const response = await fetchRequest(`${baseUrl}/health/ready`);
      lastStatus = response?.status ?? lastStatus;
      if (response?.ok) {
        const body = await response.json();
        if (body?.status === 'ready' && body?.database === 'up') {
          ready = true;
          break;
        }
      }
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : String(error);
    }
    if (attempt < readinessAttempts) await delay(500);
  }
  if (!ready) throw new Error(`就绪检查失败：${lastStatus}`);

  const home = await fetchRequest(`${baseUrl}/`);
  assertSuccessfulResponse(home, '首页检查');

  const openApi = await fetchRequest(`${baseUrl}/api/openapi.json`);
  assertSuccessfulResponse(openApi, 'OpenAPI 检查');

  const tasks = await fetchRequest(`${baseUrl}/api/v1/tasks`, {
    headers: { 'X-Demo-User-Id': 'noticeboard-master' },
  });
  assertSuccessfulResponse(tasks, '数据库只读 API 检查');
  const taskBody = await tasks.json();
  if (!Array.isArray(taskBody)) {
    throw new Error('数据库只读 API 检查失败：响应不是任务数组');
  }
}

/** Runs Docker's one allowed permanent upgrade command. */
function defaultRunDockerCommand(argumentsToRun) {
  const result = spawnSync('docker', argumentsToRun, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Docker 部署失败（退出码 ${result.status ?? 1}）`);
  }
}

/** Executes the non-destructive deployment and validates the running application. */
export async function deployPermanent(
  { dryRun = false } = {},
  {
    readGitState = readDeploymentGitState,
    runDockerCommand = defaultRunDockerCommand,
    smokeChecks = runDeploymentSmokeChecks,
  } = {},
) {
  const gitState = readGitState();
  assertDeployableGitState(gitState);
  const argumentsToRun = createDeploymentArguments();
  if (dryRun) {
    process.stdout.write(
      `DRY RUN: ${formatCommand('docker', argumentsToRun)}\n`,
    );
    return;
  }

  const lockRoot = resolve(
    gitState.commonDirectory,
    'noticeboard-lifecycle-locks',
  );
  withLifecycleLock(lockRoot, 'dynamic-port-allocation', () => {
    withLifecycleLock(lockRoot, DEPLOY_PROJECT_NAME, () => {
      runDockerCommand(argumentsToRun);
    });
  });
  await smokeChecks();
  process.stdout.write(
    `noticeboard 已部署并通过就绪与 smoke 验证：${DEPLOY_BASE_URL}\n`,
  );
}

/** Prints the permanent deployment command contract. */
function printUsage() {
  process.stdout.write(
    `用法：npm run deploy -- [选项]\n\n选项：\n  --dry-run  校验 primary main 与 clean 状态，只打印升级命令\n  --help     显示此帮助信息\n`,
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
export async function runDeployCommand(argumentsFromCli, dependencies) {
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
    printUsage();
    return 64;
  }
  if (options.help) {
    printUsage();
    return 0;
  }
  try {
    await deployPermanent(options, dependencies);
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
  process.exitCode = await runDeployCommand(process.argv.slice(2));
}
