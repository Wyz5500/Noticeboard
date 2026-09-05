/** Exercises the committed POSIX updater with real packaging, isolated installs and portable runtime discovery. */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

/** Same-version updates must install fresh content, while a failed build must preserve the working installation. */
it.each(['/bin/sh', ...(existsSync('/bin/dash') ? ['/bin/dash'] : [])])(
  'updates from a path containing spaces without changing the default Node (%s)',
  (shell) => {
    const directory = mkdtempSync(join(tmpdir(), 'noticeboard-update-'));
    const repository = join(directory, 'source with spaces');
    const prefix = join(directory, 'installed prefix');
    const bin = join(directory, 'user bin');
    const script = join(repository, 'scripts/update-cli.sh');
    const nvm = join(directory, 'nvm');
    const oldRuntime = join(directory, 'old-runtime');
    try {
      mkdirSync(join(repository, 'scripts'), { recursive: true });
      for (const name of [
        'update-cli.sh',
        'pack-client.mjs',
        'build-cli.mjs',
        'install-cli-local.mjs',
        'runtime-version.mjs',
      ]) {
        cpSync(resolve('scripts', name), join(repository, 'scripts', name));
      }
      cpSync(resolve('apps/cli'), join(repository, 'apps/cli'), {
        recursive: true,
      });
      cpSync(
        resolve('tsconfig.base.json'),
        join(repository, 'tsconfig.base.json'),
      );
      symlinkSync(
        resolve('node_modules'),
        join(repository, 'node_modules'),
        'dir',
      );
      mkdirSync(join(nvm, 'versions/node/v24.0.0/bin'), { recursive: true });
      symlinkSync(
        process.execPath,
        join(nvm, 'versions/node/v24.0.0/bin/node'),
      );
      mkdirSync(oldRuntime);
      writeFileSync(
        join(oldRuntime, 'node'),
        '#!/bin/sh\nprintf "v18.20.8\\n"\n',
      );
      chmodSync(join(oldRuntime, 'node'), 0o755);
      const env = {
        ...process.env,
        PATH: `${oldRuntime}:/usr/bin:/bin`,
        NVM_DIR: nvm,
        NOTICEBOARD_NODE: '',
        NOTICEBOARD_NPM_CLI: '',
        npm_config_cache: join(directory, 'cache'),
        npm_config_offline: 'true',
      };
      const args = [script, '--prefix', prefix, '--bin-dir', bin];
      const first = spawnSync(shell, args, {
        cwd: directory,
        encoding: 'utf8',
        env,
      });
      expect(first.status, first.stderr || first.stdout).toBe(0);
      expect(
        existsSync(
          join(repository, 'dist/packages/noticeboard-cli-local-0.0.0.tgz'),
        ),
      ).toBe(true);
      const installedReadme = join(
        prefix,
        'lib/node_modules/noticeboard-cli-local/README.md',
      );
      writeFileSync(
        join(repository, 'apps/cli/README.md'),
        'updated same-version package\n',
      );
      const second = spawnSync(shell, args, {
        cwd: directory,
        encoding: 'utf8',
        env: { ...env, NOTICEBOARD_NODE: process.execPath },
      });
      expect(second.status, second.stderr || second.stdout).toBe(0);
      expect(readFileSync(installedReadme, 'utf8')).toBe(
        'updated same-version package\n',
      );
      const launcher = readFileSync(join(bin, 'noticeboard'), 'utf8');
      writeFileSync(
        join(repository, 'apps/cli/src/main.ts'),
        'invalid syntax {{{',
      );
      const failed = spawnSync(shell, args, {
        cwd: directory,
        encoding: 'utf8',
        env,
      });
      expect(failed.status).not.toBe(0);
      expect(readFileSync(join(bin, 'noticeboard'), 'utf8')).toBe(launcher);
      expect(readFileSync(installedReadme, 'utf8')).toBe(
        'updated same-version package\n',
      );
      const help = spawnSync(join(bin, 'noticeboard'), ['--help'], {
        cwd: directory,
        encoding: 'utf8',
        env,
      });
      expect(help.status, help.stderr).toBe(0);
      expect(help.stdout).toContain('task list');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  30_000,
);

/** Usage must work without a runtime and reject unknown flags before packaging or installation. */
it('handles help and invalid arguments before runtime lookup', () => {
  const script = resolve('scripts/update-cli.sh');
  const env = {
    ...process.env,
    NOTICEBOARD_NODE: '/missing/node',
    PATH: '/usr/bin:/bin',
  };
  const help = spawnSync('/bin/sh', [script, '--help'], {
    encoding: 'utf8',
    env,
  });
  expect(help.status, help.stderr).toBe(0);
  expect(help.stdout).toContain('NOTICEBOARD_NODE');
  for (const args of [
    ['--typo'],
    ['--prefix'],
    ['--prefix', '--help'],
    ['--bin-dir', 'one', '--bin-dir', 'two'],
  ]) {
    const invalid = spawnSync('/bin/sh', [script, ...args], {
      encoding: 'utf8',
      env,
    });
    expect(invalid.status, invalid.stderr).toBe(64);
  }
  const runtime = spawnSync('/bin/sh', [script], { encoding: 'utf8', env });
  expect(runtime.status).not.toBe(0);
  expect(runtime.stderr).toContain('Node 24');
});
