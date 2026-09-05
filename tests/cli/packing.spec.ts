/** Checks local package delivery and a Node-pinned user installation without touching real profiles. */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { expect, it } from 'vitest';

/** Both documented pack commands must deliver tarballs without publishing or reusing stale builds. */
it('packs SDK and CLI and installs a CLI independent of the default Node and repository', () => {
  const directory = mkdtempSync(join(tmpdir(), 'noticeboard-local-install-'));
  const npm =
    process.env.npm_execpath ??
    resolve(
      dirname(process.execPath),
      '../lib/node_modules/npm/bin/npm-cli.js',
    );
  const env = {
    ...process.env,
    npm_config_cache: join(directory, 'cache'),
    npm_config_offline: 'true',
  };
  const prefix = join(directory, 'user prefix');
  const bin = join(directory, 'user bin');
  const artifacts = join(directory, 'artifacts');
  /** Executes a real child process and reports its complete failure output. */
  function run(args: string[]): string {
    const result = spawnSync(process.execPath, args, { encoding: 'utf8', env });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    return result.stdout;
  }
  try {
    for (const target of ['sdk', 'cli']) {
      run([npm, 'run', `${target}:pack`, '--', '--out-dir', artifacts]);
      expect(
        existsSync(join(artifacts, `noticeboard-${target}-local-0.0.0.tgz`)),
      ).toBe(true);
    }
    const installArgs = [
      'scripts/install-cli-local.mjs',
      '--tarball',
      join(artifacts, 'noticeboard-cli-local-0.0.0.tgz'),
      '--prefix',
      prefix,
      '--bin-dir',
      bin,
    ];
    run(installArgs);
    run(installArgs);
    rmSync(artifacts, { recursive: true });
    const fakeRuntime = join(directory, 'old-node');
    mkdirSync(fakeRuntime);
    writeFileSync(join(fakeRuntime, 'node'), '#!/bin/sh\nexit 42\n');
    chmodSync(join(fakeRuntime, 'node'), 0o755);
    for (const [args, status] of [
      [['man', 'task', 'create', '--json'], 0],
      [['task', 'create', '--json'], 64],
    ] as const) {
      const result = spawnSync(join(bin, 'noticeboard'), args, {
        cwd: directory,
        encoding: 'utf8',
        env: {
          ...env,
          PATH: fakeRuntime,
          NOTICEBOARD_CONFIG_FILE: join(directory, 'unused.json'),
        },
      });
      expect(result.status, result.stderr).toBe(status);
      if (status === 0)
        expect(JSON.parse(result.stdout).data.manual).toContain(
          '--description-file',
        );
      else expect(JSON.parse(result.stderr).error.kind).toBe('usage');
    }
    expect(existsSync(join(directory, 'unused.json'))).toBe(false);
    writeFileSync(
      join(bin, 'noticeboard'),
      '#!/bin/sh\n# unrelated user command\nexit 0\n',
    );
    const refused = spawnSync(process.execPath, installArgs, {
      encoding: 'utf8',
      env,
    });
    expect(refused.status).not.toBe(0);
    expect(readFileSync(join(bin, 'noticeboard'), 'utf8')).toContain(
      'unrelated user command',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 30_000);
