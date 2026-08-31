/** Verifies the deployment wrapper exposes a safe dry-run and help contract. */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SCRIPT_PATH = resolve(
  dirname(import.meta.url.slice('file://'.length)),
  'deploy.sh',
);
const COMPOSE_PATH = resolve(
  dirname(import.meta.url.slice('file://'.length)),
  '../compose.yaml',
);

/** Runs the shell wrapper with the requested argument and returns its output. */
function runScript(argument) {
  return execFileSync('bash', [SCRIPT_PATH, argument], {
    encoding: 'utf8',
  });
}

const dryRun = runScript('--dry-run');
assert.match(dryRun, /docker compose .*compose\.yaml config --quiet/);
assert.match(dryRun, /docker compose .*compose\.yaml up -d --build --wait/);
assert.equal(dryRun.includes(' -p '), false);

const help = runScript('--help');
assert.match(help, /用法：.*deploy\.sh/);
assert.match(help, /--dry-run/);

/** Proves the Compose project and database volume use the product identity. */
const compose = readFileSync(COMPOSE_PATH, 'utf8');
assert.match(compose, /^name: noticeboard$/m);
assert.match(
  compose,
  /DATABASE_URL: postgresql:\/\/noticeboard:noticeboard@postgres:5432\/noticeboard/,
);
assert.match(compose, /POSTGRES_DB: noticeboard/);
assert.match(compose, /POSTGRES_PASSWORD: noticeboard/);
assert.match(compose, /POSTGRES_USER: noticeboard/);
assert.match(compose, /^\s{6}- noticeboard-postgres:\/var\/lib\/postgresql$/m);
assert.match(compose, /^\s{4}name: noticeboard-postgres$/m);
