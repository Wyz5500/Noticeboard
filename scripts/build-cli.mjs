/** Bundles only the HTTP CLI dependency graph into an isolated private installable package. */
import { build } from 'esbuild';
import { chmod, copyFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { 'out-dir': { type: 'string' } } });
const output = resolve(values['out-dir'] ?? 'dist/cli');
await mkdir(join(output, 'bin'), { recursive: true });
await build({
  entryPoints: ['apps/cli/src/main.ts'],
  outfile: join(output, 'bin/noticeboard.js'),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  banner: { js: '#!/usr/bin/env node' },
  sourcemap: false,
  legalComments: 'none',
});
await chmod(join(output, 'bin/noticeboard.js'), 0o755);
await copyFile('apps/cli/package.json', join(output, 'package.json'));
await copyFile('apps/cli/README.md', join(output, 'README.md'));
