/** Builds a standalone ESM SDK package in a fresh staging directory before replacing compiler output. */
import { execFileSync } from 'node:child_process';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
} from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { assertSupportedNodeVersion } from './runtime-version.mjs';

assertSupportedNodeVersion();
const { values } = parseArgs({ options: { outDir: { type: 'string' } } });
const output = resolve(values.outDir ?? 'dist/sdk');
const local = relative(process.cwd(), output);
if (
  !local ||
  (!local.startsWith('../') && !local.startsWith('dist/')) ||
  relative(output, process.cwd()).startsWith('../') === false
) {
  throw new Error('SDK 输出目录必须位于 dist 内或仓库外，且不能是仓库的父目录');
}
try {
  const stat = await lstat(output);
  if (!stat.isDirectory()) throw new Error(`拒绝替换非目录输出：${output}`);
  if ((await readdir(output)).length) {
    const manifestPath = join(output, 'package.json');
    let owned = false;
    try {
      owned =
        JSON.parse(await readFile(manifestPath, 'utf8')).name ===
        'noticeboard-sdk-local';
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError))
        throw error;
    }
    if (!owned)
      throw new Error(`拒绝替换非 SDK 构建目录：${output}；请选择空目录`);
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(dirname(output), { recursive: true });
const staging = await mkdtemp(join(dirname(output), '.noticeboard-sdk-'));
try {
  execFileSync(
    process.execPath,
    [
      'node_modules/typescript/bin/tsc',
      '-p',
      'apps/cli/tsconfig.sdk.build.json',
      '--outDir',
      staging,
    ],
    { stdio: 'inherit' },
  );
  await copyFile('apps/cli/sdk.package.json', join(staging, 'package.json'));
  await copyFile('apps/cli/SDK-README.md', join(staging, 'README.md'));
  await rm(output, { recursive: true, force: true });
  await rename(staging, output);
} finally {
  await rm(staging, { recursive: true, force: true });
}
