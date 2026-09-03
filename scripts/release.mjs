/** Merges one verified candidate into local main and safely compensates a failed deployment. */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDeployableGitState, deployPermanent } from './deploy.mjs';
import { assertSupportedRuntimeVersions } from './runtime-version.mjs';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, '..');

/** Runs one Git command and returns stdout when requested. */
function runGit(cwd, argumentsToRun, { capture = true } = {}) {
  const result = spawnSync('git', argumentsToRun, {
    cwd,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      (capture ? result.stderr.trim() : '') ||
        `git ${argumentsToRun.join(' ')} 失败（退出码 ${result.status}）`,
    );
  }
  return capture ? result.stdout.trim() : '';
}

/** Reads the primary/main/clean deployment state from an arbitrary checkout. */
function readReleaseGitState(cwd) {
  const commonDirectory = runGit(cwd, [
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ]);
  const gitDirectory = runGit(cwd, [
    'rev-parse',
    '--path-format=absolute',
    '--git-dir',
  ]);
  const branchResult = spawnSync(
    'git',
    ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (branchResult.error) throw branchResult.error;
  return {
    commonDirectory,
    gitDirectory,
    branch: branchResult.status === 0 ? branchResult.stdout.trim() : null,
    status: runGit(cwd, ['status', '--porcelain']),
  };
}

/** Reads and validates the exact two-parent merge relationship at HEAD. */
function readMergeParents(cwd) {
  const [mergeSha, ...parents] = runGit(cwd, [
    'rev-list',
    '--parents',
    '-n',
    '1',
    'HEAD',
  ]).split(' ');
  if (parents.length !== 2) {
    throw new Error('release 创建的 HEAD 不是预期的两父 merge commit');
  }
  return { mergeSha, firstParent: parents[0], secondParent: parents[1] };
}

/** Resolves and validates every immutable release input before merging. */
function prepareRelease({ cwd, candidate, expectSha, confirmAutoRevert }) {
  if (!confirmAutoRevert) {
    throw new Error('release 必须显式提供 --confirm-auto-revert');
  }
  if (!/^[a-f0-9]{40}$/.test(expectSha)) {
    throw new Error('--expect-sha 必须是 40 位小写 Git SHA');
  }
  assertDeployableGitState(readReleaseGitState(cwd));
  const mainSha = runGit(cwd, ['rev-parse', 'HEAD']);
  const originMainSha = runGit(cwd, [
    'rev-parse',
    '--verify',
    'refs/remotes/origin/main',
  ]);
  if (mainSha !== originMainSha) {
    throw new Error('release 前本地 main 必须与本地 origin/main 完全一致');
  }
  const candidateSha = runGit(cwd, [
    'rev-parse',
    '--verify',
    `${candidate}^{commit}`,
  ]);
  if (candidateSha !== expectSha) {
    throw new Error(
      `候选提交与 --expect-sha 不一致：${candidateSha} !== ${expectSha}`,
    );
  }
  let verifiedSha;
  try {
    verifiedSha = runGit(cwd, [
      'rev-parse',
      '--verify',
      `refs/noticeboard/verified/${candidateSha}`,
    ]);
  } catch {
    throw new Error(`候选提交缺少最终验证凭据：${candidateSha}`);
  }
  if (verifiedSha !== candidateSha) {
    throw new Error(`最终验证凭据未指向候选提交：${candidateSha}`);
  }
  return { mainSha, candidateSha };
}

/** Ensures automatic compensation can target only this release's unchanged merge commit. */
function assertSafeRevertState(cwd, expectedMerge) {
  const state = readReleaseGitState(cwd);
  if (state.branch !== 'main') {
    throw new Error('部署失败后分支已改变，拒绝自动撤回');
  }
  if (state.status) {
    throw new Error('部署失败后工作区已改变，拒绝自动撤回');
  }
  const currentSha = runGit(cwd, ['rev-parse', 'HEAD']);
  if (currentSha !== expectedMerge.mergeSha) {
    throw new Error('部署失败后 HEAD 已改变，拒绝自动撤回');
  }
  const currentMerge = readMergeParents(cwd);
  if (
    currentMerge.firstParent !== expectedMerge.firstParent ||
    currentMerge.secondParent !== expectedMerge.secondParent
  ) {
    throw new Error('部署失败后 merge 父提交已改变，拒绝自动撤回');
  }
}

/** Releases one verified candidate and compensates exactly one failed deployment. */
export async function releaseCandidate(
  { candidate, expectSha, confirmAutoRevert, dryRun = false },
  { cwd = PROJECT_ROOT, deploy = () => deployPermanent() } = {},
) {
  const prepared = prepareRelease({
    cwd,
    candidate,
    expectSha,
    confirmAutoRevert,
  });
  const mergeMessage = `合并发布：${candidate} (${prepared.candidateSha.slice(0, 12)})`;
  if (dryRun) {
    process.stdout.write(
      `DRY RUN: git merge --no-ff -m '${mergeMessage}' ${prepared.candidateSha}\n`,
    );
    process.stdout.write('DRY RUN: npm run deploy\n');
    process.stdout.write(
      'DRY RUN: 部署失败时仅撤回上述 merge commit，并尝试一次补偿部署\n',
    );
    return { status: 'dry-run', candidateSha: prepared.candidateSha };
  }

  runGit(cwd, ['merge', '--no-ff', '-m', mergeMessage, prepared.candidateSha]);
  const merge = readMergeParents(cwd);
  if (
    merge.firstParent !== prepared.mainSha ||
    merge.secondParent !== prepared.candidateSha
  ) {
    throw new Error('release merge 的父提交与预期候选不一致');
  }
  assertDeployableGitState(readReleaseGitState(cwd));

  try {
    await deploy();
    return { status: 'deployed', mergeSha: merge.mergeSha };
  } catch (deploymentError) {
    assertSafeRevertState(cwd, merge);
    runGit(cwd, ['revert', '-m', '1', '--no-commit', merge.mergeSha]);
    runGit(cwd, ['commit', '-m', `撤回发布：${merge.mergeSha}`]);
    try {
      await deploy();
    } catch (compensationError) {
      throw new Error(
        `部署失败，合并已自动撤回，但补偿部署仍失败：${compensationError instanceof Error ? compensationError.message : String(compensationError)}`,
        { cause: compensationError },
      );
    }
    throw new Error('部署失败，合并已自动撤回，补偿部署已恢复永久实例', {
      cause: deploymentError,
    });
  }
}

/** Parses the explicit local release transaction interface. */
function parseArguments(argumentsFromCli) {
  if (argumentsFromCli.includes('--help') || argumentsFromCli.includes('-h')) {
    return { help: true };
  }
  let candidate;
  let expectSha;
  let confirmAutoRevert = false;
  let dryRun = false;
  for (const argument of argumentsFromCli) {
    if (argument.startsWith('--expect-sha=')) {
      expectSha = argument.slice('--expect-sha='.length);
      continue;
    }
    if (argument === '--confirm-auto-revert') {
      confirmAutoRevert = true;
      continue;
    }
    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (!argument.startsWith('-') && !candidate) {
      candidate = argument;
      continue;
    }
    throw new Error(`未知选项或多余参数：${argument}`);
  }
  if (!candidate) throw new Error('缺少候选分支或提交');
  if (!expectSha) throw new Error('缺少 --expect-sha=<40位SHA>');
  return { candidate, expectSha, confirmAutoRevert, dryRun };
}

/** Prints the local-main release workflow and its automatic compensation boundary. */
function printUsage() {
  process.stdout.write(
    '用法：npm run release -- <候选分支> --expect-sha=<40位SHA> --confirm-auto-revert [--dry-run]\n\n命令不 fetch、不 push、不 reset，也不自动执行数据库 migration revert。\n',
  );
}

/** Runs the release CLI and returns a shell-compatible exit code. */
export async function runReleaseCommand(argumentsFromCli) {
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
    const result = await releaseCandidate(options);
    if (result.status === 'deployed') {
      process.stdout.write(
        `release 成功：${result.mergeSha}；请在获得明确授权后再 push main。\n`,
      );
    }
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
  process.exitCode = await runReleaseCommand(process.argv.slice(2));
}
