/** Tests PostgreSQL-only worktree lifecycle and runtime contracts. */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withLifecycleLock } from './lifecycle-lock.mjs';
import * as runtimeVersion from './runtime-version.mjs';
import {
  createComposeArguments,
  createInstanceComposeEnvironment,
  createInstanceEnvironment,
  createInstanceProjectName,
  createInstanceVolumeName,
  normalizeInstancePart,
  parsePublishedPort,
} from './instance.mjs';

const { assertSupportedNodeVersion } = runtimeVersion;

process.env.npm_config_user_agent ??= 'npm/11.19.1 node/v24.20.0';

const SCRIPT_PATH = fileURLToPath(new URL('./instance.mjs', import.meta.url));
const COMPOSE_PATH = fileURLToPath(new URL('../compose.yaml', import.meta.url));
const PACKAGE_PATH = fileURLToPath(new URL('../package.json', import.meta.url));
const DOCKERFILE_PATH = fileURLToPath(
  new URL('../Dockerfile', import.meta.url),
);
const NVM_PATH = fileURLToPath(new URL('../.nvmrc', import.meta.url));
const NODE_VERSION_PATH = fileURLToPath(
  new URL('../.node-version', import.meta.url),
);

/** Accepts every Node 24 release while rejecting other runtime majors. */
test('requires the repository Node major before lifecycle work starts', () => {
  assert.doesNotThrow(() => assertSupportedNodeVersion('24.0.0'));
  assert.doesNotThrow(() => assertSupportedNodeVersion('24.20.0'));
  assert.doesNotThrow(() => assertSupportedNodeVersion('24.99.99'));
  assert.throws(() => assertSupportedNodeVersion('23.20.0'), /Node 24\.x/);
  assert.throws(() => assertSupportedNodeVersion('25.0.0'), /Node 24\.x/);
  assert.throws(
    () => assertSupportedNodeVersion('invalid'),
    /有效的 Node 版本/,
  );
});

/** Accepts every npm 11 release while rejecting other package-manager majors. */
test('requires the repository npm major before lifecycle work starts', () => {
  assert.equal(typeof runtimeVersion.assertSupportedNpmVersion, 'function');
  assert.doesNotThrow(() => runtimeVersion.assertSupportedNpmVersion('11.0.0'));
  assert.doesNotThrow(() =>
    runtimeVersion.assertSupportedNpmVersion('11.99.0'),
  );
  assert.throws(
    () => runtimeVersion.assertSupportedNpmVersion('10.8.2'),
    /npm 11\.x/,
  );
  assert.throws(
    () => runtimeVersion.assertSupportedNpmVersion('12.0.0'),
    /npm 11\.x/,
  );
  assert.throws(
    () => runtimeVersion.assertSupportedNpmVersion('invalid'),
    /有效的 npm 版本/,
  );
});

/** Validates Node and npm majors together at every lifecycle entry point. */
test('validates the complete local runtime contract', () => {
  assert.doesNotThrow(() =>
    runtimeVersion.assertSupportedRuntimeVersions({
      nodeVersion: '24.1.0',
      npmVersion: '11.2.0',
    }),
  );
  assert.throws(
    () =>
      runtimeVersion.assertSupportedRuntimeVersions({
        nodeVersion: '24.1.0',
        npmVersion: '10.8.2',
      }),
    /npm 11\.x/,
  );
});

/** Keeps runtime selectors on majors without relaxing application dependencies. */
test('declares only Node and npm runtime majors', () => {
  const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));
  const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');

  assert.deepEqual(packageJson.engines, {
    node: '>=24 <25',
    npm: '>=11 <12',
  });
  assert.equal(packageJson.packageManager, undefined);
  assert.equal(readFileSync(NVM_PATH, 'utf8').trim(), '24');
  assert.equal(readFileSync(NODE_VERSION_PATH, 'utf8').trim(), '24');
  assert.match(dockerfile, /^FROM node:24-alpine AS runtime-base$/m);
  assert.doesNotMatch(
    dockerfile,
    /\bnpm\s+(?:install|i|update|upgrade)\s[^\r\n]*\bnpm(?:@|\s|$)/m,
    'Container builds must use the npm bundled with the Node base image',
  );
  assert.equal(packageJson.dependencies['@nestjs/common'], '11.2.3');
  assert.equal(packageJson.devDependencies['@playwright/test'], '1.63.0');
  assert.equal(packageJson.allowScripts['esbuild@0.28.2'], true);
  assert.equal(packageJson.scripts['start:dev'], 'node scripts/run-local.mjs');
  assert.equal(packageJson.scripts.release, 'node scripts/release.mjs');
  for (const specification of [
    'scripts/instance.spec.mjs',
    'scripts/local-app.spec.mjs',
    'scripts/verify.spec.mjs',
    'scripts/deploy.spec.mjs',
    'scripts/release.spec.mjs',
  ]) {
    assert.match(
      packageJson.scripts['test:instance'],
      new RegExp(specification),
    );
  }
});

/** Rejects lifecycle commands before Docker when npm uses the wrong major. */
test('checks npm before lifecycle command parsing starts', () => {
  assert.throws(
    () =>
      execFileSync(process.execPath, [SCRIPT_PATH, '--help'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          npm_config_user_agent: 'npm/10.8.2 node/v24.20.0',
        },
        stdio: 'pipe',
      }),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stderr, /npm 11\.x/);
      return true;
    },
  );
});

/** Prevents two lifecycle commands from mutating the same database project concurrently. */
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
test('normalizes arbitrary worktree text into safe instance parts', () => {
  assert.equal(
    normalizeInstancePart('Feature/Admin Redesign'),
    'feature-admin-redesign',
  );
  assert.equal(normalizeInstancePart('///'), 'instance');
});

/** Separates development, complete verification, and standalone browser databases. */
test('creates stable purpose-scoped project names for one worktree', () => {
  const worktreePath = '/Users/wyz/project_manager';
  const dev = createInstanceProjectName({ worktreePath, purpose: 'dev' });
  const verify = createInstanceProjectName({ worktreePath, purpose: 'verify' });
  const playwright = createInstanceProjectName({
    worktreePath,
    purpose: 'playwright',
  });

  assert.match(dev, /^noticeboard-project-manager-[a-f0-9]{12}-dev$/);
  assert.match(verify, /-verify$/);
  assert.match(playwright, /-playwright$/);
  assert.equal(new Set([dev, verify, playwright]).size, 3);
  assert.ok(Math.max(dev.length, verify.length, playwright.length) <= 63);
});

/** Verifies distinct worktrees cannot share a purpose-scoped Compose project. */
test('creates different project names for distinct worktrees', () => {
  const first = createInstanceProjectName({
    worktreePath: '/tmp/noticeboard',
    purpose: 'verify',
  });
  const second = createInstanceProjectName({
    worktreePath: '/tmp/noticeboard-other',
    purpose: 'verify',
  });
  assert.notEqual(first, second);
});

/** Verifies the current database volume name is predictable and project-scoped. */
test('creates the project-scoped PostgreSQL volume name', () => {
  assert.equal(
    createInstanceVolumeName('noticeboard-project-manager-a1b2c3-dev'),
    'noticeboard-project-manager-a1b2c3-dev_postgres-data',
  );
});

/** Verifies every Compose invocation carries both the file and isolated project arguments. */
test('builds isolated Compose arguments for database commands', () => {
  assert.deepEqual(
    createComposeArguments(
      '/workspace/compose.yaml',
      'noticeboard-feature-a1b2c3-verify',
      ['up', '-d', '--wait', 'postgres'],
    ),
    [
      'compose',
      '-f',
      '/workspace/compose.yaml',
      '-p',
      'noticeboard-feature-a1b2c3-verify',
      'up',
      '-d',
      '--wait',
      'postgres',
    ],
  );
});

/** Verifies Docker's published endpoint resolves to the database host port. */
test('parses published Docker ports and rejects unusable output', () => {
  assert.equal(parsePublishedPort('127.0.0.1:49152\n'), 49152);
  assert.equal(parsePublishedPort('[::1]:49153'), 49153);
  assert.throws(() => parsePublishedPort(''), /发布端口/);
  assert.throws(() => parsePublishedPort('127.0.0.1:not-a-port'), /发布端口/);
});

/** Supplies both application and test database variables to host processes. */
test('builds instance-specific database environment variables', () => {
  assert.deepEqual(createInstanceEnvironment(41002), {
    DATABASE_URL:
      'postgresql://noticeboard:noticeboard@127.0.0.1:41002/noticeboard',
    DATABASE_URL_TEST:
      'postgresql://noticeboard:noticeboard@127.0.0.1:41002/noticeboard',
    TASK_BUSINESS_TIME_ZONE: 'Asia/Shanghai',
    TASK_CURRENT_DATE_OVERRIDE: '2026-09-01',
  });
});

/** Gives Compose only a dynamic loopback PostgreSQL port. */
test('builds PostgreSQL-only Compose environment variables', () => {
  assert.deepEqual(createInstanceComposeEnvironment(), {
    POSTGRES_HOST_PORT: '',
  });
});

/** Keeps the local Compose topology limited to one isolated PostgreSQL service. */
test('configures only PostgreSQL in local Compose', () => {
  const compose = readFileSync(COMPOSE_PATH, 'utf8');

  assert.match(compose, /^services:\n {2}postgres:/);
  assert.doesNotMatch(compose, /^ {2}(?:app|migrate|seed):/m);
  assert.doesNotMatch(compose, /\bbuild:/);
  assert.doesNotMatch(compose, /APP_HOST_PORT|TASK_CURRENT_DATE_OVERRIDE/);
  assert.match(compose, /127\.0\.0\.1:\$\{POSTGRES_HOST_PORT-\}:5432/);
  assert.match(compose, /postgres:18\.6-alpine/);
});

/** Verifies destroy refuses Docker access until explicit data-loss confirmation. */
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

/** Prints a PostgreSQL-only startup followed by host migration and seed. */
test('dry-run starts only PostgreSQL and prepares it from the host', () => {
  const output = execFileSync(
    process.execPath,
    [SCRIPT_PATH, 'up', '--dry-run'],
    { encoding: 'utf8' },
  );

  assert.match(output, /POSTGRES_HOST_PORT=/);
  assert.match(output, /-dev up -d --wait postgres/);
  assert.match(output, /npm run db:migrate/);
  assert.match(output, /npm run db:seed/);
  assert.doesNotMatch(output, /--build|APP_HOST_PORT| port app |\bapp\b/);
});

/** Shows only PostgreSQL state and never expects a Docker application service. */
test('dry-run status queries only the database service', () => {
  const output = execFileSync(
    process.execPath,
    [SCRIPT_PATH, 'status', '--dry-run'],
    { encoding: 'utf8' },
  );

  assert.match(output, /-dev ps postgres/);
  assert.match(output, /-dev port postgres 5432/);
  assert.doesNotMatch(output, /port app|页面|Swagger/);
});

/** Verifies destroy removes only the current development database resources. */
test('dry-run destroy removes the dev volume without touching deployment data', () => {
  const output = execFileSync(
    process.execPath,
    [SCRIPT_PATH, 'destroy', '--yes', '--dry-run'],
    { encoding: 'utf8' },
  );

  assert.match(output, /-dev down -v --remove-orphans/);
  assert.doesNotMatch(output, /-p noticeboard down|noticeboard-postgres/);
});

/** Keeps complete verification out of the database lifecycle CLI. */
test('instance CLI no longer exposes a Docker-backed verify command', () => {
  assert.throws(
    () =>
      execFileSync(process.execPath, [SCRIPT_PATH, 'verify', '--dry-run'], {
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    (error) => {
      assert.equal(error.status, 64);
      assert.match(error.stderr, /未知命令：verify/);
      return true;
    },
  );
});

/** Prevents any local lifecycle command from targeting the permanent deployment. */
test('dry-run database startup never operates on the noticeboard project', () => {
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
  assert.match(output, /当前 worktree 的开发数据库/);
});
