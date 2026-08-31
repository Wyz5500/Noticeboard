/** Runs the reproducible quality gate, including a real PostgreSQL adapter and browser equivalence suite. */
import { spawnSync } from 'node:child_process';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgresql://noticeboard:noticeboard@127.0.0.1:54329/noticeboard';

/** Runs one command with inherited output and stops immediately on failure. */
function run(command, args, environment = {}) {
  process.stdout.write(`\n> ${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, {
    env: { ...process.env, ...environment },
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** Brings up PostgreSQL, prepares its schema, then executes every read-only quality check in order. */
function main() {
  run('docker', ['compose', 'up', '-d', '--wait', 'postgres']);
  run('npm', ['run', 'db:migrate'], { DATABASE_URL: TEST_DATABASE_URL });
  run('npm', ['run', 'db:seed'], { DATABASE_URL: TEST_DATABASE_URL });
  for (const script of [
    'format:check',
    'lint',
    'typecheck',
    'comments',
    'architecture',
    'test:unit',
  ]) {
    run('npm', ['run', script]);
  }
  run('npm', ['run', 'test:api'], { DATABASE_URL_TEST: TEST_DATABASE_URL });
  run('npm', ['run', 'test:contract'], {
    DATABASE_URL_TEST: TEST_DATABASE_URL,
  });
  run('npm', ['run', 'test:e2e'], { DATABASE_URL_TEST: TEST_DATABASE_URL });
  run('npm', ['run', 'test:visual'], { DATABASE_URL_TEST: TEST_DATABASE_URL });
  run('git', ['diff', '--check']);
}

main();
