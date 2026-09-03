/** Tests the host-only complete verification orchestration contract. */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const VERIFY_PATH = resolve(SCRIPT_DIRECTORY, 'verify.mjs');
const VITEST_PATH = resolve(PROJECT_ROOT, 'node_modules/vitest/vitest.mjs');

process.env.npm_config_user_agent ??= 'npm/11.19.1 node/v24.20.0';

/** Runs the complete gate on the host while Docker starts only a verify database. */
test('verify dry-run keeps build application and tests on the host', () => {
  const output = execFileSync(process.execPath, [VERIFY_PATH, '--dry-run'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });

  assert.match(output, /-verify up -d --wait postgres/);
  assert.match(output, /npm run db:migrate/);
  assert.match(output, /npm run db:seed/);
  for (const script of [
    'format:check',
    'lint',
    'typecheck',
    'comments',
    'architecture',
    'test:instance',
    'build',
    'test:unit',
    'test:api',
    'test:contract',
  ]) {
    assert.match(output, new RegExp(`npm run ${script.replace(':', '\\:')}`));
  }
  assert.match(output, /HOST=127\.0\.0\.1 PORT=0 .*node .*dist\/api\/main\.js/);
  assert.match(output, /E2E_BASE_URL=<dynamic-host-url> .*npm run test:e2e/);
  assert.match(output, /E2E_BASE_URL=<dynamic-host-url> .*npm run test:visual/);
  assert.match(output, /DRY RUN: git diff --check/);
  assert.match(output, /-verify down -v --remove-orphans/);
  assert.doesNotMatch(
    output,
    /--build|APP_HOST_PORT|port app|compose .*\bapp\b/,
  );
});

/** Final verification records the candidate commit without performing deployment work. */
test('final verify dry-run records only a local verified ref', () => {
  const output = execFileSync(
    process.execPath,
    [VERIFY_PATH, '--final', '--dry-run'],
    { cwd: PROJECT_ROOT, encoding: 'utf8' },
  );

  assert.match(output, /git status --porcelain/);
  assert.match(output, /git rev-parse HEAD/);
  assert.match(output, /git update-ref refs\/noticeboard\/verified\//);
  assert.doesNotMatch(
    output,
    /compose\.deploy\.yaml|-p noticeboard up|npm run deploy/,
  );
});

/** Prevents database-backed suites from silently passing when no database was supplied. */
test('database-backed test entries fail without DATABASE_URL_TEST', () => {
  const environment = { ...process.env };
  delete environment.DATABASE_URL;
  delete environment.DATABASE_URL_TEST;
  for (const config of ['vitest.http.config.ts', 'vitest.contract.config.ts']) {
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [VITEST_PATH, 'run', '--config', config],
          {
            cwd: PROJECT_ROOT,
            env: environment,
            encoding: 'utf8',
            stdio: 'pipe',
          },
        ),
      (error) => {
        assert.equal(error.status, 1);
        assert.match(`${error.stdout}\n${error.stderr}`, /DATABASE_URL_TEST/);
        return true;
      },
    );
  }
});

/** Rejects unknown verification options without touching Docker. */
test('verify rejects unsupported options', () => {
  assert.throws(
    () =>
      execFileSync(process.execPath, [VERIFY_PATH, '--keep'], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    (error) => {
      assert.equal(error.status, 64);
      assert.match(error.stderr, /未知选项/);
      return true;
    },
  );
});
