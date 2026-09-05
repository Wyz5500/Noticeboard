/** Runs the complete quality gate on the host with only PostgreSQL in Docker. */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatCommand,
  readInstanceContext,
  runGitDiffCheck,
  runHostNpmScript,
  startDatabaseInstance,
  stopDatabaseInstance,
} from './instance.mjs';
import { withLifecycleLock } from './lifecycle-lock.mjs';
import { startLocalApplication } from './local-app.mjs';
import { assertSupportedRuntimeVersions } from './runtime-version.mjs';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const STATIC_SCRIPTS = [
  'format:check',
  'lint',
  'typecheck',
  'comments',
  'architecture',
  'openapi:check',
  'openapi:compatibility',
  'client:check',
  'test:instance',
];
const DATABASE_TEST_SCRIPTS = ['test:unit', 'test:api', 'test:contract'];

/** Reads one successful Git command or raises its actionable failure. */
function runGitCaptured(argumentsToRun) {
  const result = spawnSync('git', argumentsToRun, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() ||
        `git ${argumentsToRun.join(' ')} 失败（退出码 ${result.status}）`,
    );
  }
  return result.stdout.trim();
}

/** Requires a committed, clean, stable candidate before final verification starts. */
function readFinalCandidate() {
  const status = runGitCaptured(['status', '--porcelain']);
  if (status) throw new Error('最终验证要求工作区和暂存区均为 clean');
  return runGitCaptured(['rev-parse', 'HEAD']);
}

/** Records the exact candidate commit that completed final verification. */
function recordFinalCandidate(candidateSha, { dryRun = false } = {}) {
  const reference = `refs/noticeboard/verified/${candidateSha}`;
  if (dryRun) {
    process.stdout.write(
      `DRY RUN: ${formatCommand('git', ['update-ref', reference, candidateSha])}\n`,
    );
    return;
  }
  const currentSha = readFinalCandidate();
  if (currentSha !== candidateSha) {
    throw new Error('最终验证期间 HEAD 已改变，拒绝记录验证凭据');
  }
  const result = spawnSync('git', ['update-ref', reference, candidateSha], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`记录最终验证凭据失败（退出码 ${result.status ?? 1}）`);
  }
}

/** Prints one dynamic host application startup command for dry-run inspection. */
function printApplicationDryRun(environment) {
  const commandEnvironment = {
    ...environment,
    HOST: '127.0.0.1',
    PORT: '0',
  };
  const environmentPrefix = Object.entries(commandEnvironment)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  process.stdout.write(
    `DRY RUN: ${environmentPrefix} ${formatCommand(process.execPath, ['dist/api/main.js'])}\n`,
  );
}

/** Parses complete-verification options without lifecycle escape hatches. */
function parseArguments(argumentsFromCli) {
  let dryRun = false;
  let final = false;
  for (const argument of argumentsFromCli) {
    if (argument === '--dry-run' && !dryRun) {
      dryRun = true;
      continue;
    }
    if (argument === '--final' && !final) {
      final = true;
      continue;
    }
    if (argument === '--help' || argument === '-h') return { help: true };
    throw new Error(`未知选项或多余参数：${argument}`);
  }
  return { dryRun, final };
}

/** Prints the complete host verification command contract. */
function printUsage() {
  process.stdout.write(
    '用法：npm run verify -- [--final] [--dry-run]\n\n--final 要求 clean 提交，并在成功后记录本地 verified Git ref。\n',
  );
}

/** Executes host checks against one purpose-scoped PostgreSQL database. */
async function verify(options) {
  const context = readInstanceContext({ purpose: 'verify' });
  let candidateSha;
  if (options.final) {
    if (options.dryRun) {
      process.stdout.write('DRY RUN: git status --porcelain\n');
      process.stdout.write('DRY RUN: git rev-parse HEAD\n');
      candidateSha = '<candidate-sha>';
    } else {
      candidateSha = readFinalCandidate();
    }
  }

  if (options.dryRun) {
    const endpoints = startDatabaseInstance(context, {
      dryRun: true,
      print: false,
    });
    for (const script of STATIC_SCRIPTS) {
      runHostNpmScript(script, endpoints.environment, { dryRun: true });
    }
    runHostNpmScript('build', endpoints.environment, { dryRun: true });
    for (const script of DATABASE_TEST_SCRIPTS) {
      runHostNpmScript(script, endpoints.environment, { dryRun: true });
    }
    printApplicationDryRun(endpoints.environment);
    const browserEnvironment = {
      ...endpoints.environment,
      E2E_BASE_URL: '<dynamic-host-url>',
    };
    runHostNpmScript('test:e2e', browserEnvironment, { dryRun: true });
    runHostNpmScript('test:visual', browserEnvironment, { dryRun: true });
    runGitDiffCheck({ dryRun: true });
    if (options.final) recordFinalCandidate(candidateSha, { dryRun: true });
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
    for (const script of STATIC_SCRIPTS) {
      runHostNpmScript(script, endpoints.environment);
    }
    runHostNpmScript('build', endpoints.environment);
    for (const script of DATABASE_TEST_SCRIPTS) {
      runHostNpmScript(script, endpoints.environment);
    }
    application = await startLocalApplication({
      command: process.execPath,
      args: ['dist/api/main.js'],
      cwd: PROJECT_ROOT,
      environment: endpoints.environment,
    });
    const browserEnvironment = {
      ...endpoints.environment,
      E2E_BASE_URL: application.baseUrl,
    };
    runHostNpmScript('test:e2e', browserEnvironment);
    runHostNpmScript('test:visual', browserEnvironment);
    await application.stop();
    application = undefined;
    runGitDiffCheck();
    if (options.final) recordFinalCandidate(candidateSha);
    succeeded = true;
    withLifecycleLock(context.lockRoot, context.projectName, () =>
      stopDatabaseInstance(context, { removeVolume: true }),
    );
    return 0;
  } finally {
    if (application) await application.stop();
    if (!succeeded) {
      process.stderr.write(
        `验证失败，PostgreSQL 现场已保留：${context.projectName}\n检查：docker compose -f compose.yaml -p ${context.projectName} ps postgres\n日志：docker compose -f compose.yaml -p ${context.projectName} logs postgres\n`,
      );
    }
  }
}

/** Runs the complete verification CLI and returns a shell-compatible exit code. */
export async function runVerifyCommand(argumentsFromCli) {
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
    return await verify(options);
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
  process.exitCode = await runVerifyCommand(process.argv.slice(2));
}
