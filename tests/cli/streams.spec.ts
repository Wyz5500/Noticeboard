/** Exercises real executable output pipes so asynchronous stream failures cannot leak Node exceptions. */
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';

let directory: string;
let executable: string;
let configFile: string;

/** Builds the actual executable and creates output large enough to outlive an early pipe reader. */
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'noticeboard-streams-'));
  execFileSync(process.execPath, [
    'scripts/build-cli.mjs',
    '--out-dir',
    join(directory, 'package'),
  ]);
  executable = join(directory, 'package/bin/noticeboard.js');
  configFile = join(directory, 'config.json');
  const profiles = Object.fromEntries(
    Array.from({ length: 6000 }, (_, index) => [
      `profile-${index}`,
      { baseUrl: 'https://example.test', demoUserId: 'noticeboard-master' },
    ]),
  );
  await writeFile(
    configFile,
    JSON.stringify({ version: 1, currentProfile: 'profile-0', profiles }),
  );
});

/** Deletes only executable and config fixtures created by this suite. */
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

/** Closing the consumer after its first chunk must end quietly in both text and JSON modes. */
it.each([false, true])(
  'handles an early stdout reader close with JSON=%s',
  async (json) => {
    const child = spawn(
      process.execPath,
      [executable, 'profile', 'list', ...(json ? ['--json'] : [])],
      {
        env: { ...process.env, NOTICEBOARD_CONFIG_FILE: configFile },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      },
    );
    let stderr = '';
    let received = 0;
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.stdout.once('data', (chunk: Buffer) => {
      received += chunk.length;
      child.stdout.destroy();
    });
    const closed = new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    try {
      const result = await closed;
      expect(received).toBeGreaterThan(0);
      expect(result, stderr).toEqual({ code: 0, signal: null });
      expect(stderr).toBe('');
    } finally {
      if (child.exitCode === null) child.kill();
    }
  },
  10_000,
);

/** A real non-pipe write failure must produce a controlled error rather than being mistaken for success. */
it.each([false, true])('reports an unwritable stdout with JSON=%s', (json) => {
  const descriptor = openSync(configFile, 'r');
  try {
    const result = spawnSync(
      process.execPath,
      [executable, '--help', ...(json ? ['--json'] : [])],
      {
        stdio: ['ignore', descriptor, 'pipe'],
        encoding: 'utf8',
        timeout: 5000,
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain('Unhandled');
    if (json)
      expect(JSON.parse(result.stderr)).toMatchObject({
        error: { kind: 'internal', code: 'EBADF' },
        meta: { exitCode: 1 },
      });
    else expect(result.stderr).toContain('无法写入标准输出');
  } finally {
    closeSync(descriptor);
  }
});

/** A closed diagnostic sink must still terminate with failure and leave stdout empty. */
it('keeps stdout empty when stderr is already closed', async () => {
  const child = spawn(
    process.execPath,
    [executable, 'invalid-command', '--json'],
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 },
  );
  child.stderr.destroy();
  let stdout = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
  });
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code));
  });
  try {
    expect(await closed).toBe(1);
    expect(stdout).toBe('');
  } finally {
    if (child.exitCode === null) child.kill();
  }
}, 10_000);
