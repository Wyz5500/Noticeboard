/** Tests the isolated local Compose instance lifecycle contracts. */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withLifecycleLock } from './lifecycle-lock.mjs';
import { assertSupportedNodeVersion } from './runtime-version.mjs';
import {
  createComposeArguments,
  createInstanceComposeEnvironment,
  createInstanceEnvironment,
  createInstanceProjectName,
  createInstanceVolumeName,
  createPlaywrightProjectName,
  isReservedAppPort,
  normalizeInstancePart,
  parsePublishedPort,
} from './instance.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./instance.mjs', import.meta.url));

/** Prevents lifecycle commands from starting Docker under an unsupported Node runtime. */
test('requires the repository Node version before lifecycle work starts', () => {
  assert.doesNotThrow(() => assertSupportedNodeVersion('24.20.0'));
  assert.throws(() => assertSupportedNodeVersion('18.20.8'), /Node 24\.20\.0/);
  assert.throws(() => assertSupportedNodeVersion('24.19.0'), /Node 24\.20\.0/);
});

/** Prevents two lifecycle commands from mutating the same Compose project concurrently. */
test('serializes commands that share one lifecycle lock', () => {
  const lockRoot = mkdtempSync(join(tmpdir(), 'noticeboard-lock-'));
  try {
    withLifecycleLock(lockRoot, 'same-project', () => {
      assert.throws(
        () =>
          withLifecycleLock(lockRoot, 'same-project', () => undefined, {
            timeoutMs: 0,
          }),
        /正在执行/,
      );
    });
    assert.doesNotThrow(() =>
      withLifecycleLock(lockRoot, 'same-project', () => undefined),
    );
  } finally {
    rmSync(lockRoot, { recursive: true, force: true });
  }
});

/** Prevents a reused live PID from preserving an abandoned lock forever. */
test('reclaims an expired lifecycle lock even when its PID exists', () => {
  const lockRoot = mkdtempSync(join(tmpdir(), 'noticeboard-stale-lock-'));
  const lockPath = join(lockRoot, 'stale-project.lock');
  try {
    writeFileSync(lockPath, String(process.pid));
    const expiredAt = new Date(Date.now() - 7 * 60 * 60 * 1000);
    utimesSync(lockPath, expiredAt, expiredAt);

    assert.doesNotThrow(() =>
      withLifecycleLock(lockRoot, 'stale-project', () => undefined, {
        timeoutMs: 0,
      }),
    );
  } finally {
    rmSync(lockRoot, { recursive: true, force: true });
  }
});

/** Verifies branch and path punctuation becomes a Docker-safe identifier part. */
test('normalizes arbitrary branch and worktree text into safe instance parts', () => {
  assert.equal(
    normalizeInstancePart('Feature/Admin Redesign'),
    'feature-admin-redesign',
  );
  assert.equal(normalizeInstancePart('///'), 'instance');
});

/** Verifies one worktree keeps its project identity across commit and branch changes. */
test('keeps one project name stable across commits and branch changes', () => {
  const first = createInstanceProjectName({
    branch: 'feature/admin',
    worktreePath: '/Users/wyz/project_manager',
    commitHash: '1234567890ab',
  });
  const second = createInstanceProjectName({
    branch: 'release/next',
    worktreePath: '/Users/wyz/project_manager',
    commitHash: 'abcdef123456',
  });

  assert.equal(first, second);
  assert.match(first, /^noticeboard-project-manager-/);
  assert.match(first, /^[a-z0-9][a-z0-9-]+$/);
  assert.ok(first.length <= 63);
});

/** Verifies same branches in distinct worktrees cannot share a Compose project. */
test('creates different project names for distinct worktrees', () => {
  const first = createInstanceProjectName({
    branch: 'feature/admin',
    worktreePath: '/tmp/noticeboard',
    commitHash: 'abcdef123456',
  });
  const second = createInstanceProjectName({
    branch: 'feature/admin',
    worktreePath: '/tmp/noticeboard-other',
    commitHash: 'abcdef123456',
  });

  assert.notEqual(first, second);
});

/** Verifies the current instance volume name is predictable and project-scoped. */
test('creates the project-scoped PostgreSQL volume name', () => {
  assert.equal(
    createInstanceVolumeName('noticeboard-project_manager-a1b2c3'),
    'noticeboard-project_manager-a1b2c3_postgres-data',
  );
});

/** Prevents standalone browser checks from sharing the main worktree instance. */
test('creates a distinct bounded Playwright project name', () => {
  assert.equal(
    createPlaywrightProjectName('noticeboard-project-manager-a1b2c3'),
    'noticeboard-project-manager-a1b2c3-playwright',
  );
  assert.ok(
    createPlaywrightProjectName(`noticeboard-${'a'.repeat(54)}`).length <= 63,
  );
});

/** Prevents every temporary worktree lifecycle from accepting the deployment port. */
test('reserves app port 3000 from all worktree instances', () => {
  assert.equal(isReservedAppPort(3000), true);
  assert.equal(isReservedAppPort(30_000), false);
});

/** Verifies every Compose invocation carries both the file and isolated project arguments. */
test('builds isolated Compose arguments for lifecycle commands', () => {
  assert.deepEqual(
    createComposeArguments(
      '/workspace/compose.yaml',
      'noticeboard-feature-a1b2c3',
      ['up', '-d', '--build', '--wait'],
    ),
    [
      'compose',
      '-f',
      '/workspace/compose.yaml',
      '-p',
      'noticeboard-feature-a1b2c3',
      'up',
      '-d',
      '--build',
      '--wait',
    ],
  );
});

/** Verifies Docker's published endpoint formats resolve to the host port used by tests. */
test('parses published Docker ports and rejects unusable output', () => {
  assert.equal(parsePublishedPort('127.0.0.1:49152\n'), 49152);
  assert.equal(parsePublishedPort('[::1]:49153'), 49153);
  assert.throws(() => parsePublishedPort(''), /发布端口/);
  assert.throws(() => parsePublishedPort('127.0.0.1:not-a-port'), /发布端口/);
});

/** Verifies API and browser checks receive the current instance endpoints. */
test('builds instance-specific test environment variables', () => {
  assert.deepEqual(createInstanceEnvironment(41001, 41002), {
    DATABASE_URL_TEST:
      'postgresql://noticeboard:noticeboard@127.0.0.1:41002/noticeboard',
    E2E_BASE_URL: 'http://127.0.0.1:41001',
  });
});

/** Verifies instance Compose overrides retain dynamic ports without changing default Compose behavior. */
test('builds empty host-port overrides for isolated Compose commands', () => {
  assert.deepEqual(createInstanceComposeEnvironment(), {
    APP_HOST_PORT: '',
    POSTGRES_HOST_PORT: '',
  });
});

/** Verifies destroy refuses to contact Docker until explicit data-loss confirmation is supplied. */
test('requires --yes before destroy even in dry-run mode', () => {
  assert.throws(
    () =>
      execFileSync(process.execPath, [SCRIPT_PATH, 'destroy', '--dry-run'], {
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    (error) => {
      assert.equal(error.status, 64);
      assert.match(error.stderr, /--yes/);
      return true;
    },
  );
});

/** Verifies destroy removes only the current worktree resources. */
test('dry-run destroy removes the worktree volume without touching deployment data', () => {
  const output = execFileSync(
    process.execPath,
    [SCRIPT_PATH, 'destroy', '--yes', '--dry-run'],
    { encoding: 'utf8' },
  );

  assert.match(
    output,
    /docker compose .* -p noticeboard-.* down -v --remove-orphans/,
  );
  assert.doesNotMatch(output, /-p noticeboard down|noticeboard-postgres/);
});

/** Verifies dry-run emits isolated commands without requiring a Docker daemon. */
test('dry-run prints the isolated Compose command without connecting Docker', () => {
  const output = execFileSync(
    process.execPath,
    [SCRIPT_PATH, 'up', '--dry-run'],
    {
      encoding: 'utf8',
    },
  );

  assert.match(
    output,
    /DRY RUN: .*docker compose -f .*compose\.yaml -p noticeboard-/,
  );
  assert.match(output, /POSTGRES_HOST_PORT=/);
  assert.match(output, / up -d --build --wait/);
  assert.doesNotMatch(output, /docker info/);
});

/** Verifies successful validation always removes its database volume. */
test('dry-run verify includes the final diff check and destructive temporary cleanup', () => {
  const output = execFileSync(
    process.execPath,
    [SCRIPT_PATH, 'verify', '--dry-run'],
    { encoding: 'utf8' },
  );

  assert.match(output, /DRY RUN: git diff --check/);
  assert.match(output, /docker compose .* down -v --remove-orphans/);
});

/** Prevents callers from retaining a successful validation environment. */
test('verify rejects the removed --keep escape hatch', () => {
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [SCRIPT_PATH, 'verify', '--keep', '--dry-run'],
        { encoding: 'utf8', stdio: 'pipe' },
      ),
    (error) => {
      assert.equal(error.status, 64);
      assert.match(error.stderr, /--keep/);
      return true;
    },
  );
});

/** Prevents any worktree lifecycle command from targeting the permanent deployment. */
test('dry-run worktree startup never operates on the noticeboard project', () => {
  const output = execFileSync(
    process.execPath,
    [SCRIPT_PATH, 'up', '--dry-run'],
    { encoding: 'utf8' },
  );

  assert.doesNotMatch(output, /-p noticeboard (?:down|up|create)/);
  assert.doesNotMatch(output, /noticeboard-postgres/);
});

/** Verifies the documented help flag works before a command token. */
test('accepts --help before the instance command', () => {
  const output = execFileSync(process.execPath, [SCRIPT_PATH, '--help'], {
    encoding: 'utf8',
  });

  assert.match(output, /用法：npm run instance/);
});
