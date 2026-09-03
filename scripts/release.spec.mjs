/** Tests the local main merge, deployment, and safe revert release transaction. */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import * as release from './release.mjs';

/** Runs one Git command in a temporary release repository. */
function git(cwd, argumentsToRun) {
  return execFileSync('git', argumentsToRun, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** Creates a main branch, one verified feature commit, and a local origin/main ref. */
function createReleaseRepository({ verified = true } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'noticeboard-release-'));
  git(cwd, ['init', '-b', 'main']);
  git(cwd, ['config', 'user.name', 'Release Test']);
  git(cwd, ['config', 'user.email', 'release@example.test']);
  writeFileSync(join(cwd, 'notice.txt'), 'main\n');
  git(cwd, ['add', 'notice.txt']);
  git(cwd, ['commit', '-m', '初始化 main']);
  const mainSha = git(cwd, ['rev-parse', 'HEAD']);
  git(cwd, ['update-ref', 'refs/remotes/origin/main', mainSha]);

  git(cwd, ['switch', '-c', 'feature/example']);
  writeFileSync(join(cwd, 'notice.txt'), 'feature\n');
  git(cwd, ['add', 'notice.txt']);
  git(cwd, ['commit', '-m', '实现功能']);
  const candidateSha = git(cwd, ['rev-parse', 'HEAD']);
  if (verified) {
    git(cwd, [
      'update-ref',
      `refs/noticeboard/verified/${candidateSha}`,
      candidateSha,
    ]);
  }
  git(cwd, ['switch', 'main']);
  return { cwd, mainSha, candidateSha };
}

/** Merges exactly the verified candidate and deploys the resulting local main once. */
test('releases a verified candidate through a no-ff main merge', async () => {
  const repository = createReleaseRepository();
  let deployments = 0;
  try {
    const result = await release.releaseCandidate(
      {
        candidate: 'feature/example',
        expectSha: repository.candidateSha,
        confirmAutoRevert: true,
      },
      {
        cwd: repository.cwd,
        deploy: async () => {
          deployments += 1;
        },
      },
    );

    assert.equal(result.status, 'deployed');
    assert.equal(deployments, 1);
    const [mergeSha, firstParent, secondParent] = git(repository.cwd, [
      'rev-list',
      '--parents',
      '-n',
      '1',
      'HEAD',
    ]).split(' ');
    assert.equal(result.mergeSha, mergeSha);
    assert.equal(firstParent, repository.mainSha);
    assert.equal(secondParent, repository.candidateSha);
    assert.equal(git(repository.cwd, ['branch', '--show-current']), 'main');
    assert.match(
      git(repository.cwd, ['log', '-1', '--pretty=%s']),
      /^合并发布：feature\/example/,
    );
    assert.equal(git(repository.cwd, ['status', '--porcelain']), '');
  } finally {
    rmSync(repository.cwd, { recursive: true, force: true });
  }
});

/** Rejects an unverified candidate before creating a merge commit. */
test('requires the exact candidate final-verification ref', async () => {
  const repository = createReleaseRepository({ verified: false });
  try {
    await assert.rejects(
      release.releaseCandidate(
        {
          candidate: 'feature/example',
          expectSha: repository.candidateSha,
          confirmAutoRevert: true,
        },
        { cwd: repository.cwd, deploy: async () => undefined },
      ),
      /最终验证凭据/,
    );
    assert.equal(
      git(repository.cwd, ['rev-parse', 'HEAD']),
      repository.mainSha,
    );
  } finally {
    rmSync(repository.cwd, { recursive: true, force: true });
  }
});

/** Reverts only the merge created by this release and redeploys the restored source once. */
test('automatically reverts a failed deployment and performs one compensating deployment', async () => {
  const repository = createReleaseRepository();
  let deployments = 0;
  try {
    await assert.rejects(
      release.releaseCandidate(
        {
          candidate: 'feature/example',
          expectSha: repository.candidateSha,
          confirmAutoRevert: true,
        },
        {
          cwd: repository.cwd,
          deploy: async () => {
            deployments += 1;
            if (deployments === 1) throw new Error('deployment failed');
          },
        },
      ),
      /已自动撤回.*补偿部署已恢复/,
    );

    assert.equal(deployments, 2);
    assert.match(
      git(repository.cwd, ['log', '-1', '--pretty=%s']),
      /^撤回发布：/,
    );
    assert.equal(
      readFileSync(join(repository.cwd, 'notice.txt'), 'utf8'),
      'main\n',
    );
    assert.equal(git(repository.cwd, ['status', '--porcelain']), '');
  } finally {
    rmSync(repository.cwd, { recursive: true, force: true });
  }
});

/** Refuses to guess a revert target if deployment changes HEAD unexpectedly. */
test('does not auto-revert after HEAD changes outside the release transaction', async () => {
  const repository = createReleaseRepository();
  try {
    await assert.rejects(
      release.releaseCandidate(
        {
          candidate: 'feature/example',
          expectSha: repository.candidateSha,
          confirmAutoRevert: true,
        },
        {
          cwd: repository.cwd,
          deploy: async () => {
            writeFileSync(join(repository.cwd, 'outside.txt'), 'outside\n');
            git(repository.cwd, ['add', 'outside.txt']);
            git(repository.cwd, ['commit', '-m', '外部提交']);
            throw new Error('deployment failed');
          },
        },
      ),
      /HEAD 已改变.*拒绝自动撤回/,
    );
    assert.equal(git(repository.cwd, ['log', '-1', '--pretty=%s']), '外部提交');
  } finally {
    rmSync(repository.cwd, { recursive: true, force: true });
  }
});
