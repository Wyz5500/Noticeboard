/** Exercises the SDK as an offline npm consumer, including its public module and declaration boundary. */
import { spawnSync } from 'node:child_process';
import {
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

/** Missing package metadata, leaked internal exports, or stale build files must fail a real installed consumer. */
it('builds a clean SDK package consumable by name outside the repository', () => {
  const directory = mkdtempSync(join(tmpdir(), 'noticeboard-sdk-package-'));
  const output = join(directory, 'package');
  const npm =
    process.env.npm_execpath ??
    resolve(
      dirname(process.execPath),
      '../lib/node_modules/npm/bin/npm-cli.js',
    );
  /** Runs real build and npm commands with an isolated cache and no registry access. */
  function run(args: string[], cwd = process.cwd()): string {
    const result = spawnSync(process.execPath, args, {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        npm_config_cache: join(directory, 'cache'),
        npm_config_offline: 'true',
      },
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    return result.stdout;
  }
  try {
    run([npm, 'run', 'sdk:build', '--', '--outDir', output]);
    expect(
      existsSync(join(output, 'package.json')),
      'independent SDK build must supply installable package metadata',
    ).toBe(true);
    writeFileSync(
      join(output, 'stale.js'),
      'throw new Error("obsolete output");',
    );
    run([npm, 'run', 'sdk:build', '--', '--outDir', output]);
    expect(existsSync(join(output, 'stale.js'))).toBe(false);
    const manifest = JSON.parse(
      readFileSync(join(output, 'package.json'), 'utf8'),
    );
    expect(manifest).toMatchObject({
      name: 'noticeboard-sdk-local',
      version: '0.0.0',
      private: true,
      type: 'module',
    });
    expect(manifest.dependencies).toBeUndefined();
    const packed = JSON.parse(
      run([
        npm,
        'pack',
        output,
        '--json',
        '--ignore-scripts',
        '--pack-destination',
        directory,
      ]),
    )[0] as { filename: string; files: { path: string }[] };
    for (const { path } of packed.files) {
      expect(path).toMatch(
        /^(?:README\.md|package\.json|(?:internal\/)*(?:generated\/)?[\w-]+\.(?:js|d\.ts))$/,
      );
    }
    const consumer = join(directory, 'consumer');
    mkdirSync(consumer);
    writeFileSync(
      join(consumer, 'package.json'),
      '{"private":true,"type":"module"}',
    );
    run(
      [
        npm,
        'install',
        join(directory, packed.filename),
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
      ],
      consumer,
    );
    rmSync(output, { recursive: true });
    const result = run(
      [
        '--input-type=module',
        '-e',
        `
      import { createNoticeboardClient } from 'noticeboard-sdk-local';
      const client = createNoticeboardClient({baseUrl:'https://example.test', fetch: async () => Response.json([])});
      const blocked = [];
      for (const path of ['internal/client.js', 'internal/generated/transport.js', 'models.js']) {
        try { await import('noticeboard-sdk-local/' + path); }
        catch (error) { blocked.push(error.code); }
      }
      process.stdout.write(JSON.stringify({data:await client.tasks.list(), blocked}));
    `,
      ],
      consumer,
    );
    expect(JSON.parse(result)).toEqual({
      data: [],
      blocked: Array(3).fill('ERR_PACKAGE_PATH_NOT_EXPORTED'),
    });
    writeFileSync(
      join(consumer, 'consumer.mts'),
      `
      import { createNoticeboardClient, type Task } from 'noticeboard-sdk-local';
      const client = createNoticeboardClient({baseUrl:'https://example.test'});
      const tasks: Task[] = await client.tasks.list();
      void tasks;
      // @ts-expect-error Package subpaths are not public API.
      await import('noticeboard-sdk-local/internal/generated/transport.js');
    `,
    );
    run(
      [
        resolve('node_modules/typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--exactOptionalPropertyTypes',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--target',
        'ES2023',
        'consumer.mts',
      ],
      consumer,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 30_000);

/** An explicit output argument must not turn a build into deletion of an unrelated directory. */
it('refuses to replace an unrelated nonempty output directory', () => {
  const directory = mkdtempSync(join(tmpdir(), 'noticeboard-sdk-unowned-'));
  const sentinel = join(directory, 'user-data.txt');
  writeFileSync(sentinel, 'keep this file');
  try {
    const result = spawnSync(
      process.execPath,
      ['scripts/build-sdk.mjs', '--outDir', directory],
      { encoding: 'utf8' },
    );
    expect(result.status).not.toBe(0);
    expect(readFileSync(sentinel, 'utf8')).toBe('keep this file');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
