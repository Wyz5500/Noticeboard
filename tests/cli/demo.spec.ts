/** Exercises destructive demo commands through real argument parsing, SDK transport and output. */
import { mkdtemp, readdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runCli, type CliContext } from '../../apps/cli/src/run.js';
import { apiError } from '../sdk/fixtures.js';

let directory: string;
let requests: Request[];
let respond: () => Response;
/** Isolates local configuration and replaces only the external HTTP server. */
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'noticeboard-demo-'));
  requests = [];
  respond = () => Response.json({ reset: true });
});
/** Removes only this test's configuration directory. */
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
/** Captures process output while running the production dispatcher. */
async function invoke(args: string[], overrides: Partial<CliContext> = {}) {
  let stdout = '';
  let stderr = '';
  const exitCode = await runCli(args, {
    env: { NOTICEBOARD_CONFIG_FILE: join(directory, 'config.json') },
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
    isTTY: false,
    confirm: async () => {
      throw new Error('unexpected prompt');
    },
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      return respond();
    },
    ...overrides,
  });
  return { exitCode, stdout, stderr };
}

/** JSON and non-TTY invocations cannot bypass confirmation; rejection sends no request. */
it.each([
  { tty: false, json: false, yes: false, answer: true, want: 64, prompts: 0 },
  { tty: false, json: true, yes: false, answer: true, want: 64, prompts: 0 },
  { tty: true, json: true, yes: false, answer: true, want: 64, prompts: 0 },
  { tty: true, json: false, yes: false, answer: false, want: 64, prompts: 1 },
  { tty: true, json: false, yes: false, answer: true, want: 0, prompts: 1 },
  { tty: false, json: false, yes: true, answer: false, want: 0, prompts: 0 },
  { tty: false, json: true, yes: true, answer: false, want: 0, prompts: 0 },
  { tty: true, json: true, yes: true, answer: false, want: 0, prompts: 0 },
  { tty: true, json: false, yes: true, answer: false, want: 0, prompts: 0 },
])(
  'confirms reset with $tty/$json/$yes/$answer',
  async ({ tty, json, yes, answer, want, prompts }) => {
    let prompted = 0;
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const result = await invoke(
      [
        'demo',
        'reset',
        '--base-url',
        'https://example.test/proxy',
        ...(json ? ['--json'] : []),
        ...(yes ? ['--yes'] : []),
      ],
      {
        isTTY: tty,
        confirm: async (question) => {
          prompted++;
          expect(requests).toHaveLength(0);
          expect(timeout).not.toHaveBeenCalled();
          expect(question).toContain('https://example.test/proxy');
          expect(question).toContain('全部任务');
          expect(question).toContain('时间线');
          return answer;
        },
      },
    );
    expect(result.exitCode, result.stderr).toBe(want);
    expect(prompted).toBe(prompts);
    expect(requests).toHaveLength(want === 0 ? 1 : 0);
    if (want === 0) {
      expect(timeout).toHaveBeenCalledExactlyOnceWith(30_000);
      expect(result.stderr).toBe('');
      if (json)
        expect(JSON.parse(result.stdout)).toEqual({ data: { reset: true } });
      else expect(result.stdout).toContain('已重置');
      expect(requests[0]!.method).toBe('POST');
      expect(await requests[0]!.text()).toBe('');
    } else expect(result.stdout).toBe('');
    expect(await readdir(directory)).toEqual([]);
  },
);

/** Syntax errors must never reach confirmation or the server. */
it.each([
  ['extra', '--yes'],
  ['--expected-version', '1', '--yes'],
  ['--yes', '--yes'],
  ['--mine', '--yes'],
  ['--unknown'],
])('rejects reset options %j', async (...args) => {
  const result = await invoke(['demo', 'reset', ...args, '--json']);
  expect(result.exitCode).toBe(64);
  expect(result.stdout).toBe('');
  expect(requests).toHaveLength(0);
});

/** Saved, environment and command profiles affect the actual destination without persisting overrides. */
it('uses configuration precedence and preserves the saved snapshot', async () => {
  const path = join(directory, 'config.json');
  const saved = JSON.stringify({
    version: 1,
    currentProfile: 'local',
    profiles: {
      local: { baseUrl: 'https://saved.test', demoUserId: 'saved-user' },
      remote: { baseUrl: 'https://remote.test', demoUserId: 'remote-user' },
    },
  });
  await writeFile(path, saved);
  for (const [args, env, url, user] of [
    [[], {}, 'https://saved.test', 'saved-user'],
    [
      [],
      { NOTICEBOARD_PROFILE: 'remote' },
      'https://remote.test',
      'remote-user',
    ],
    [
      ['--profile', 'local'],
      { NOTICEBOARD_PROFILE: 'remote' },
      'https://saved.test',
      'saved-user',
    ],
    [
      [],
      {
        NOTICEBOARD_BASE_URL: 'https://env.test',
        NOTICEBOARD_USER: 'env-user',
      },
      'https://env.test',
      'env-user',
    ],
    [
      ['--base-url', 'https://flag.test/proxy', '--user', 'flag-user'],
      {
        NOTICEBOARD_BASE_URL: 'https://env.test',
        NOTICEBOARD_USER: 'env-user',
      },
      'https://flag.test/proxy',
      'flag-user',
    ],
  ] as const) {
    requests = [];
    const result = await invoke(['demo', 'reset', '--yes', '--json', ...args], {
      env: { NOTICEBOARD_CONFIG_FILE: path, ...env },
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(`${url}/api/v1/demo/reset`);
    expect(requests[0]!.headers.get('x-demo-user-id')).toBe(user);
    expect(await readFile(path, 'utf8')).toBe(saved);
  }
});

/** Remote failures keep stable exits and reset-specific reconciliation without a version. */
it.each([
  { status: 400, want: 64 },
  { status: 401, want: 77 },
  { status: 403, want: 77 },
  { status: 404, want: 66 },
  { status: 409, want: 75 },
  { status: 429, want: 75 },
  { status: 500, want: 69 },
  { status: 503, want: 65 },
  { status: 0, want: 69 },
])('reports reset failure $status', async ({ status, want }) => {
  respond = () => {
    if (!status) throw new TypeError('offline');
    if (status === 503) return new Response('<html>', { status });
    return Response.json(apiError, { status });
  };
  const result = await invoke(['demo', 'reset', '--yes', '--json']);
  expect(result.exitCode).toBe(want);
  expect(result.stdout).toBe('');
  expect(requests).toHaveLength(1);
  const failure = JSON.parse(result.stderr);
  expect(failure.meta).toEqual({ exitCode: want });
  if (status === 409 || status === 503 || !status) {
    expect(failure.error.hint).toContain('task list');
    if (status !== 409) expect(failure.error.hint).toContain('可能已提交');
  }
  if (status && status !== 503)
    expect(failure.error).toMatchObject({ status, code: apiError.error.code });
  expect(result.stderr).not.toContain('expectedVersion');
});

/** Active cancellation must propagate to the request and retain uncertain reset diagnostics. */
it('reports timeout cancellation without retrying the reset', async () => {
  const controller = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  let calls = 0;
  const result = await invoke(['demo', 'reset', '--yes', '--json'], {
    fetch: async (_input, init) => {
      calls++;
      controller.abort(new Error('timeout'));
      init!.signal!.throwIfAborted();
      throw new Error('cancellation was not propagated');
    },
  });
  expect(result.exitCode).toBe(69);
  expect(result.stdout).toBe('');
  expect(calls).toBe(1);
  expect(JSON.parse(result.stderr).error).toMatchObject({
    kind: 'network',
    reason: 'aborted',
    hint: expect.stringContaining('可能已提交'),
  });
});

/** A valid false response must not be described as a completed reset. */
it('retains false in JSON and explains it in human output', async () => {
  respond = () => Response.json({ reset: false });
  const json = await invoke(['demo', 'reset', '--yes', '--json']);
  expect(json.exitCode).toBe(0);
  expect(JSON.parse(json.stdout)).toEqual({ data: { reset: false } });
  const human = await invoke(['demo', 'reset', '--yes']);
  expect(human.exitCode).toBe(0);
  expect(human.stdout).toContain('未重置');
});

/** Help remains usable without confirmation or HTTP for each new command entry. */
it.each([[], ['demo'], ['demo', 'reset']])(
  'documents demo reset in %j help',
  async (...args) => {
    const result = await invoke([...args, '--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('demo reset');
    expect(result.stdout).toContain('--yes');
    expect(requests).toHaveLength(0);
  },
);
