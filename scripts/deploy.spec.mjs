/** Verifies the deployment wrapper exposes a safe dry-run and help contract. */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';

const SCRIPT_PATH = resolve(
  dirname(import.meta.url.slice('file://'.length)),
  'deploy.sh',
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

const help = runScript('--help');
assert.match(help, /用法：.*deploy\.sh/);
assert.match(help, /--dry-run/);
