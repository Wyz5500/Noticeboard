/** Proves the packed CLI installs and runs independently of repository source and dependencies. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { expect, it } from 'vitest';

/** Builds, inspects the actual tarball file list, and invokes its installed executable in isolation. */
it('packs only runnable client assets and installs an offline bin', () => {
  const directory = mkdtempSync(join(tmpdir(), 'noticeboard-package-'));
  const output = join(directory, 'package');
  const npm =
    process.env.npm_execpath ??
    resolve(
      dirname(process.execPath),
      '../lib/node_modules/npm/bin/npm-cli.js',
    );
  try {
    const build = spawnSync(
      process.execPath,
      ['scripts/build-cli.mjs', '--out-dir', output],
      { encoding: 'utf8' },
    );
    expect(build.status, build.stderr).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(output, 'package.json'), 'utf8'),
    );
    expect(manifest).toMatchObject({
      private: true,
      bin: { noticeboard: 'bin/noticeboard.js' },
      files: ['bin/noticeboard.js', 'README.md'],
    });
    expect(manifest.dependencies).toBeUndefined();
    const pack = spawnSync(
      process.execPath,
      [
        npm,
        'pack',
        output,
        '--json',
        '--ignore-scripts',
        '--offline',
        '--pack-destination',
        directory,
        '--cache',
        join(directory, 'cache'),
      ],
      { encoding: 'utf8' },
    );
    expect(pack.status, pack.stderr).toBe(0);
    const packed = (
      JSON.parse(pack.stdout) as {
        filename: string;
        files: { path: string }[];
      }[]
    )[0]!;
    expect(
      packed.files.map((file: { path: string }) => file.path).sort(),
    ).toEqual(['README.md', 'bin/noticeboard.js', 'package.json']);
    const installRoot = join(directory, 'installed');
    const install = spawnSync(
      process.execPath,
      [
        npm,
        'install',
        '--prefix',
        installRoot,
        join(directory, packed.filename),
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        '--cache',
        join(directory, 'cache'),
      ],
      { encoding: 'utf8' },
    );
    expect(install.status, install.stderr).toBe(0);
    const bin = join(installRoot, 'node_modules', '.bin', 'noticeboard');
    const help = spawnSync(process.execPath, [bin, '--help'], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        NOTICEBOARD_CONFIG_FILE: join(directory, 'unused.json'),
      },
    });
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain('task list');
    expect(help.stdout).toContain('task create');
    expect(help.stdout).toContain('comment edit');
    expect(help.stdout).toContain('comment delete');
    expect(help.stdout).toContain('admin overview');
    expect(help.stdout).toContain('user list');
    expect(help.stdout).toContain('role list');
    expect(help.stdout).toContain('permission list');
    expect(help.stdout).toContain('user get');
    expect(help.stdout).toContain('role get');
    expect(help.stdout).toContain('permission get');
    expect(help.stdout).toContain('--active true|false|all');
    expect(help.stdout).toContain('--deleted true|false|all');
    const invalid = spawnSync(
      process.execPath,
      [bin, 'task', 'create', '--json'],
      { cwd: directory, encoding: 'utf8' },
    );
    expect(invalid.status).toBe(64);
    expect(invalid.stdout).toBe('');
    expect(JSON.parse(invalid.stderr).error.kind).toBe('usage');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 30_000);
