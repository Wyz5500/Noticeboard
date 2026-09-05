/** Installs a trusted local CLI tarball into a dedicated POSIX user prefix with a Node-pinned launcher. */
import { execFileSync } from 'node:child_process';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { assertSupportedRuntimeVersions } from './runtime-version.mjs';

const npm =
  process.env.npm_execpath ??
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
assertSupportedRuntimeVersions({
  npmVersion: execFileSync(process.execPath, [npm, '--version'], {
    encoding: 'utf8',
  }).trim(),
});
if (process.platform === 'win32')
  throw new Error(
    '此用户安装入口仅支持 macOS/Linux；Windows 请使用 npm 全局安装',
  );
const { values } = parseArgs({
  options: {
    tarball: { type: 'string' },
    prefix: { type: 'string' },
    'bin-dir': { type: 'string' },
  },
});
const tarball = resolve(
  values.tarball ?? 'dist/packages/noticeboard-cli-local-0.0.0.tgz',
);
const prefix = resolve(
  values.prefix ?? join(homedir(), '.local/share/noticeboard'),
);
const binDirectory = resolve(
  values['bin-dir'] ?? join(homedir(), '.local/bin'),
);
const launcher = join(binDirectory, 'noticeboard');
const marker = '#!/bin/sh\n# Noticeboard managed Node-pinned launcher\n';
const installedManifest = join(
  prefix,
  'lib/node_modules/noticeboard-cli-local/package.json',
);

/** Treats only a missing path as absent; permission and other filesystem errors remain visible. */
async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/** Quotes literal filesystem paths for the POSIX exec launcher, including spaces and apostrophes. */
function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

if (await exists(launcher)) {
  const stat = await lstat(launcher);
  if (!stat.isFile() || !(await readFile(launcher, 'utf8')).startsWith(marker))
    throw new Error(`拒绝覆盖已有非 Noticeboard 启动入口：${launcher}`);
}
if (await exists(prefix)) {
  const entries = await readdir(prefix);
  if (
    entries.length &&
    (!(await exists(installedManifest)) ||
      JSON.parse(await readFile(installedManifest, 'utf8')).name !==
        'noticeboard-cli-local')
  )
    throw new Error(`拒绝覆盖非 Noticeboard 专用安装目录：${prefix}`);
}
const manifest = JSON.parse(
  execFileSync('tar', ['-xOf', tarball, 'package/package.json'], {
    encoding: 'utf8',
  }),
);
if (
  manifest.name !== 'noticeboard-cli-local' ||
  manifest.private !== true ||
  manifest.bin?.noticeboard !== 'bin/noticeboard.js' ||
  Object.keys(manifest.dependencies ?? {}).length
)
  throw new Error('只允许安装无运行时依赖的 noticeboard-cli-local 本地包');
await mkdir(binDirectory, { recursive: true });
execFileSync(
  process.execPath,
  [
    npm,
    'install',
    '--global',
    '--prefix',
    prefix,
    tarball,
    '--offline',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ],
  { stdio: 'inherit' },
);
const executable = join(
  prefix,
  'lib/node_modules/noticeboard-cli-local/bin/noticeboard.js',
);
execFileSync(process.execPath, [executable, '--help'], { stdio: 'pipe' });
const temporary = `${launcher}.${process.pid}.tmp`;
try {
  await writeFile(
    temporary,
    `${marker}exec ${shellQuote(process.execPath)} ${shellQuote(executable)} "$@"\n`,
    { mode: 0o755, flag: 'wx' },
  );
  await rename(temporary, launcher);
} finally {
  await rm(temporary, { force: true });
}
process.stdout.write(
  `已安装：${launcher}\nNode：${process.execPath}\n请确保 ${binDirectory} 位于 PATH 中；profile 保持不变。\n`,
);
