/** Delivers local client tarballs from isolated fresh builds without invoking registry publication. */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { assertSupportedRuntimeVersions } from './runtime-version.mjs';

assertSupportedRuntimeVersions();
const { values, positionals } = parseArgs({
  options: { 'out-dir': { type: 'string' } },
  allowPositionals: true,
});
const [target] = positionals;
if (positionals.length !== 1 || !['sdk', 'cli'].includes(target))
  throw new Error('用法：pack-client.mjs sdk|cli [--out-dir <目录>]');
const destination = resolve(values['out-dir'] ?? 'dist/packages');
const directory = await mkdtemp(join(tmpdir(), 'noticeboard-pack-'));
const output = join(directory, 'package');
const npm =
  process.env.npm_execpath ??
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
try {
  execFileSync(
    process.execPath,
    [
      `scripts/build-${target}.mjs`,
      target === 'sdk' ? '--outDir' : '--out-dir',
      output,
    ],
    { stdio: 'inherit' },
  );
  await mkdir(destination, { recursive: true });
  execFileSync(
    process.execPath,
    [
      npm,
      'pack',
      output,
      '--offline',
      '--ignore-scripts',
      '--pack-destination',
      destination,
    ],
    { stdio: 'inherit' },
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
