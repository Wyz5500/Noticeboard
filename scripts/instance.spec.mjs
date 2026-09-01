/** Tests the isolated local Compose instance lifecycle contracts. */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createComposeArguments,
  createInstanceComposeEnvironment,
  createInstanceEnvironment,
  createLegacyMigrationMarkerPath,
  createInstanceProjectName,
  createInstanceVolumeName,
  normalizeInstancePart,
  parsePublishedPort,
} from './instance.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./instance.mjs', import.meta.url));

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

/** Verifies legacy data imports are remembered after an instance is destroyed. */
test('creates a stable legacy migration marker path per instance', () => {
  assert.equal(
    createLegacyMigrationMarkerPath('noticeboard-project-manager-a1b2c3'),
    '/.noticeboard-migrated-noticeboard-project-manager-a1b2c3',
  );
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

/** Verifies destroy records the legacy-import decision before removing instance data. */
test('dry-run destroy preserves the legacy import decision', () => {
  const output = execFileSync(
    process.execPath,
    [SCRIPT_PATH, 'destroy', '--yes', '--dry-run'],
    { encoding: 'utf8' },
  );

  assert.match(output, /touch \/legacy\/\.noticeboard-migrated-/);
  assert.match(output, /docker compose .* down -v --remove-orphans/);
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

/** Verifies the isolated verify plan retains the repository whitespace gate. */
test('dry-run includes the final git diff check', () => {
  const output = execFileSync(
    process.execPath,
    [SCRIPT_PATH, 'verify', '--dry-run'],
    { encoding: 'utf8' },
  );

  assert.match(output, /DRY RUN: git diff --check/);
});

/** Verifies legacy volume migration is visible in dry-run without contacting Docker. */
test('dry-run includes legacy volume migration commands', () => {
  const output = execFileSync(
    process.execPath,
    [SCRIPT_PATH, 'up', '--dry-run'],
    {
      encoding: 'utf8',
    },
  );

  assert.match(output, /docker volume inspect noticeboard-postgres/);
  assert.match(output, /test ! -e \/legacy\/\.noticeboard-migrated-/);
  assert.match(
    output,
    /docker compose .* -p noticeboard down --remove-orphans/,
  );
  assert.match(
    output,
    /docker compose .* -p noticeboard-.* down -v --remove-orphans/,
  );
  assert.match(output, /docker compose .* -p noticeboard-.* create postgres/);
  assert.match(
    output,
    /docker run --rm .*noticeboard-postgres.*postgres:18\.6-alpine/,
  );
  assert.match(output, /touch \/legacy\/\.noticeboard-migrated-/);
});

/** Verifies the documented help flag works before a command token. */
test('accepts --help before the instance command', () => {
  const output = execFileSync(process.execPath, [SCRIPT_PATH, '--help'], {
    encoding: 'utf8',
  });

  assert.match(output, /用法：npm run instance/);
});
