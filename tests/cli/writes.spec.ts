/** Verifies write commands against the real SDK boundary, local inputs and observable shell results. */
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { runCli, type CliContext } from '../../apps/cli/src/run.js';
import { task, apiError, comment } from '../sdk/fixtures.js';

let directory: string;
let requests: Request[];
let respond: (request: Request) => Response;

/** Uses disposable configuration paths and captures only actual transport requests. */
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'noticeboard-writes-'));
  requests = [];
  respond = (request) =>
    Response.json(task, {
      status:
        request.method === 'POST' && request.url.endsWith('/tasks') ? 201 : 200,
    });
});

/** Cleans up only files created for the current test. */
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

/** Runs production parsing, config resolution, SDK and rendering with an external HTTP substitute. */
async function invoke(args: string[], overrides: Partial<CliContext> = {}) {
  let stdout = '';
  let stderr = '';
  const exitCode = await runCli(args, {
    env: { NOTICEBOARD_CONFIG_FILE: join(directory, 'config.json') },
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    isTTY: false,
    confirm: async () => {
      throw new Error('unexpected confirmation');
    },
    readStdin: async () => '第一行\n第二行\n',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return respond(request);
    },
    ...overrides,
  });
  return { stdout, stderr, exitCode };
}

const create = [
  'task',
  'create',
  '--title',
  '新任务',
  '--type',
  'exploration',
  '--reward',
  '奖励',
  '--due-date',
  '2026-09-10',
];
const writes = [
  {
    args: ['task', 'act', 'a/b', 'close'],
    method: 'POST',
    path: '/tasks/a%2Fb/actions',
    body: { action: 'close' },
  },
  {
    args: [
      'task',
      'renew',
      'a/b',
      '--due-date',
      '2026-09-10',
      '--recovery-strategy',
      'reopened',
    ],
    method: 'POST',
    path: '/tasks/a%2Fb/expiration-renewal',
    body: { dueDate: '2026-09-10', recoveryStrategy: 'reopened' },
  },
  {
    args: ['comment', 'create', 'a/b', '--content', '正文'],
    method: 'POST',
    path: '/tasks/a%2Fb/comments',
    body: { content: '正文' },
  },
  {
    args: ['comment', 'edit', 'a/b', 'c/d', '--content', '新正文'],
    method: 'PATCH',
    path: '/tasks/a%2Fb/comments/c%2Fd',
    body: { content: '新正文' },
  },
  {
    args: ['comment', 'delete', 'a/b', 'c/d', '--yes'],
    method: 'DELETE',
    path: '/tasks/a%2Fb/comments/c%2Fd',
    body: {},
  },
];

/** Every versioned command must honor an explicit version or read exactly once, never enumerate identities. */
it.each(writes)(
  'submits $args with explicit or pre-read versions',
  async ({ args, method, path, body }) => {
    for (const explicit of [true, false]) {
      requests = [];
      const result = await invoke([
        ...args,
        '--json',
        ...(explicit ? ['--expected-version', '7'] : []),
      ]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        data: task,
        meta: { expectedVersion: explicit ? 7 : 4 },
      });
      expect(result.stderr).toBe('');
      expect(requests.map((r) => r.method)).toEqual(
        explicit ? [method] : ['GET', method],
      );
      if (!explicit)
        expect(requests[0]!.url).toBe(
          'http://127.0.0.1:3000/api/v1/tasks/a%2Fb',
        );
      const last = requests.at(-1)!;
      expect(last.url).toBe(`http://127.0.0.1:3000/api/v1${path}`);
      expect(await last.json()).toEqual({
        ...body,
        expectedVersion: explicit ? 7 : 4,
      });
    }
    expect(await readdir(directory)).toEqual([]);
  },
);

/** A creation must preserve multiline input and must not make an optimistic pre-read. */
it.each(['argument', 'file', 'stdin'])(
  'creates a task using %s description',
  async (source) => {
    const content = '第一行\n第二行\n';
    const file = join(directory, 'description.txt');
    await writeFile(file, content);
    const args =
      source === 'argument'
        ? ['--description', content]
        : ['--description-file', source === 'file' ? file : '-'];
    const result = await invoke([...create, ...args, '--json']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ data: task });
    expect(requests).toHaveLength(1);
    expect(await requests[0]!.json()).toEqual({
      title: '新任务',
      type: 'exploration',
      reward: '奖励',
      dueDate: '2026-09-10',
      description: content,
    });
  },
);

/** Comments share the same file/stdin rules without losing user line breaks. */
it.each(['create', 'edit'])(
  'reads comment %s content from stdin',
  async (action) => {
    const result = await invoke([
      'comment',
      action,
      'task-1',
      ...(action === 'edit' ? ['c-1'] : []),
      '--content-file',
      '-',
      '--expected-version',
      '4',
      '--json',
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(await requests[0]!.json()).toEqual({
      content: '第一行\n第二行\n',
      expectedVersion: 4,
    });
  },
);

/** Invalid or conflicting input must fail before HTTP and before consuming stdin. */
it.each([
  [...create],
  [...create, '--description', 'x', '--description-file', '-'],
  [...create, '--description-file', '/no-such-noticeboard-input'],
  [...create, '--description', 'x', '--expected-version', '1'],
  ['comment', 'create', 't', '--content', ' '],
  ['comment', 'edit', 't', 'c', '--content', 'x', '--content-file', '-'],
  ['task', 'act', 't', 'invalid'],
  ['task', 'act', 't', 'close', '--yes'],
  [
    'task',
    'renew',
    't',
    '--due-date',
    '09/10/2026',
    '--recovery-strategy',
    'reopened',
  ],
  [
    'task',
    'renew',
    't',
    '--due-date',
    '2026-09-10',
    '--recovery-strategy',
    'invalid',
  ],
  ...['0', '-1', '1.2', '1e2', 'NaN', '9007199254740992'].map((version) => [
    'task',
    'act',
    't',
    'accept',
    '--expected-version',
    version,
  ]),
])('rejects invalid write arguments %j', async (...args) => {
  const result = await invoke([...args, '--json'], {
    readStdin: async () => {
      throw new Error('unexpected stdin');
    },
  });
  expect(result.exitCode).toBe(64);
  expect(result.stdout).toBe('');
  expect(JSON.parse(result.stderr).error.kind).toBe('usage');
  expect(requests).toHaveLength(0);
});

/** Invalid UTF-8 cannot silently become replacement characters in a persisted comment. */
it('rejects malformed UTF-8 files', async () => {
  const file = join(directory, 'bad.txt');
  await writeFile(file, new Uint8Array([0xff]));
  const result = await invoke([
    'comment',
    'create',
    't',
    '--content-file',
    file,
    '--json',
  ]);
  expect(result.exitCode).toBe(64);
  expect(requests).toHaveLength(0);
});

/** Delete confirmation precedes any request and JSON mode never prompts. */
it.each([
  {
    tty: false,
    json: false,
    yes: false,
    answer: true,
    allowed: false,
    prompts: 0,
  },
  {
    tty: true,
    json: true,
    yes: false,
    answer: true,
    allowed: false,
    prompts: 0,
  },
  {
    tty: true,
    json: false,
    yes: false,
    answer: false,
    allowed: false,
    prompts: 1,
  },
  {
    tty: true,
    json: false,
    yes: false,
    answer: true,
    allowed: true,
    prompts: 1,
  },
  {
    tty: false,
    json: true,
    yes: true,
    answer: false,
    allowed: true,
    prompts: 0,
  },
])(
  'confirms deletion with $tty/$json/$yes/$answer',
  async ({ tty, json, yes, answer, allowed, prompts }) => {
    let count = 0;
    const result = await invoke(
      [
        'comment',
        'delete',
        't',
        'c',
        ...(json ? ['--json'] : []),
        ...(yes ? ['--yes'] : []),
      ],
      {
        isTTY: tty,
        confirm: async () => {
          count++;
          expect(requests).toHaveLength(0);
          return answer;
        },
      },
    );
    expect(result.exitCode, result.stderr).toBe(allowed ? 0 : 64);
    expect(count).toBe(prompts);
    expect(requests).toHaveLength(allowed ? 2 : 0);
  },
);

/** Conflicts cannot cause implicit refresh/replay and must report the submitted version. */
it('reports a conflict and preserves server diagnostics without replay', async () => {
  respond = (request) =>
    request.method === 'GET'
      ? Response.json(task)
      : Response.json(apiError, { status: 409 });
  const result = await invoke([
    'comment',
    'create',
    't',
    '--content',
    '正文',
    '--json',
  ]);
  expect(result.exitCode).toBe(75);
  expect(result.stdout).toBe('');
  expect(requests.map((r) => r.method)).toEqual(['GET', 'POST']);
  expect(JSON.parse(result.stderr)).toMatchObject({
    error: {
      code: apiError.error.code,
      details: apiError.error.details,
      hint: expect.stringContaining('task get'),
    },
    meta: { exitCode: 75, expectedVersion: 4 },
  });
});

/** A failed pre-read must not be presented as an uncertain write. */
it('stops at a failed pre-read', async () => {
  respond = () => Response.json(apiError, { status: 404 });
  const result = await invoke(['task', 'act', 't', 'close', '--json']);
  expect(result.exitCode).toBe(66);
  expect(requests.map((r) => r.method)).toEqual(['GET']);
  expect(result.stderr).not.toContain('可能已提交');
});

/** Network and protocol errors during submission require reconciliation, never retry. */
it.each(['network', 'protocol'])(
  'reports uncertain %s writes',
  async (kind) => {
    let count = 0;
    const result = await invoke(
      [...create, '--description', '正文', '--json'],
      {
        fetch: async () => {
          count++;
          if (kind === 'network') throw new TypeError('connection lost');
          return new Response('{', { status: 201 });
        },
      },
    );
    expect(result.exitCode).toBe(kind === 'network' ? 69 : 65);
    expect(JSON.parse(result.stderr).error).toMatchObject({
      kind,
      hint: expect.stringContaining('可能已提交'),
    });
    expect(count).toBe(1);
  },
);

/** Local input waiting does not consume the bounded remote request window. */
it('starts one shared timeout after stdin and uses it for read and write', async () => {
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  const result = await invoke(
    ['comment', 'create', 't', '--content-file', '-', '--json'],
    {
      readStdin: async () => {
        expect(timeout).not.toHaveBeenCalled();
        return '正文';
      },
    },
  );
  expect(result.exitCode, result.stderr).toBe(0);
  expect(timeout).toHaveBeenCalledExactlyOnceWith(30_000);
  expect(requests).toHaveLength(2);
});

/** Human output exposes identifiers needed for subsequent writes while escaping terminal controls. */
it('renders write results and actionable comment IDs', async () => {
  const result = await invoke([
    'comment',
    'edit',
    't',
    'c',
    '--content',
    '正文',
  ]);
  expect(result.exitCode, result.stderr).toBe(0);
  for (const value of [task.id, comment.commentId, '版本：4'])
    expect(result.stdout).toContain(value);
});
