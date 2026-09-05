/** Exercises management commands through the real parser, SDK and output boundary. */
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { runCli, type CliContext } from '../../apps/cli/src/run.js';
import { adminOverview } from '../sdk/admin-fixtures.js';
import { apiError } from '../sdk/fixtures.js';
let directory: string;
let requests: Request[];
let respond: (r: Request) => Response;
/** Isolates config and substitutes only the external server. */
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'noticeboard-admin-writes-'));
  requests = [];
  respond = (r) =>
    r.method === 'DELETE'
      ? new Response(null, { status: 204 })
      : Response.json(
          r.url.includes('/users')
            ? adminOverview.users[0]
            : adminOverview.roles[0],
          {
            status:
              r.method === 'POST' && !r.url.endsWith('/restore') ? 201 : 200,
          },
        );
});
/** Removes only this test's files. */
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
/** Executes production behavior with captured process streams. */
async function invoke(args: string[], overrides: Partial<CliContext> = {}) {
  let stdout = '';
  let stderr = '';
  const exitCode = await runCli(args, {
    env: { NOTICEBOARD_CONFIG_FILE: join(directory, 'config.json') },
    stdout: (s) => {
      stdout += s;
    },
    stderr: (s) => {
      stderr += s;
    },
    isTTY: false,
    confirm: async () => {
      throw new Error('unexpected prompt');
    },
    fetch: async (input, init) => {
      const r = new Request(input, init);
      requests.push(r);
      return respond(r);
    },
    ...overrides,
  });
  return { stdout, stderr, exitCode };
}
const cases = [
  {
    args: ['user', 'create', '--name', '新用户', '--role-id', 'r'],
    method: 'POST',
    path: '/users',
    body: { name: '新用户', roleId: 'r' },
  },
  {
    args: ['user', 'update', 'a/b', '--name', '新用户'],
    method: 'PATCH',
    path: '/users/a%2Fb',
    body: { name: '新用户' },
  },
  {
    args: ['user', 'update', 'a/b', '--role-id', 'r'],
    method: 'PATCH',
    path: '/users/a%2Fb',
    body: { roleId: 'r' },
  },
  {
    args: ['user', 'delete', 'a/b', '--yes'],
    method: 'DELETE',
    path: '/users/a%2Fb',
  },
  {
    args: ['user', 'restore', 'a/b'],
    method: 'POST',
    path: '/users/a%2Fb/restore',
  },
  {
    args: ['role', 'create', '--name', '新角色'],
    method: 'POST',
    path: '/roles',
    body: { name: '新角色' },
  },
  {
    args: [
      'role',
      'create',
      '--name',
      '新角色',
      '--permissions',
      'tasks.view, tasks.create',
    ],
    method: 'POST',
    path: '/roles',
    body: { name: '新角色', permissions: ['tasks.view', 'tasks.create'] },
  },
  {
    args: [
      'role',
      'update',
      'a/b',
      '--name',
      '新角色',
      '--permissions',
      'tasks.view',
    ],
    method: 'PATCH',
    path: '/roles/a%2Fb',
    body: { name: '新角色', permissions: ['tasks.view'] },
  },
  {
    args: ['role', 'update', 'a/b', '--name', '新角色', '--clear-permissions'],
    method: 'PATCH',
    path: '/roles/a%2Fb',
    body: { name: '新角色', permissions: [] },
  },
  {
    args: ['role', 'delete', 'a/b', '--yes'],
    method: 'DELETE',
    path: '/roles/a%2Fb',
  },
  {
    args: ['role', 'restore', 'a/b'],
    method: 'POST',
    path: '/roles/a%2Fb/restore',
  },
];
/** Catches wrong dispatch, implicit pre-reads, dropped inputs and config persistence. */
it.each(cases)(
  'submits $args with one request',
  async ({ args, method, path, body }) => {
    const result = await invoke([
      ...args,
      '--base-url',
      'https://example.test/proxy',
      '--user',
      'noticeboard-admin',
      '--json',
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      data:
        method === 'DELETE'
          ? { ok: true, id: 'a/b' }
          : args[0] === 'user'
            ? adminOverview.users[0]
            : adminOverview.roles[0],
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(
      `https://example.test/proxy/api/v1/admin${path}`,
    );
    expect(requests[0]!.method).toBe(method);
    expect(requests[0]!.headers.get('x-demo-user-id')).toBe(
      'noticeboard-admin',
    );
    expect(await requests[0]!.text()).toBe(
      body === undefined ? '' : JSON.stringify(body),
    );
    expect(await readdir(directory)).toEqual([]);
  },
);
/** Invalid writes must be rejected before touching HTTP. */
it.each([
  ['user', 'create', '--name', '新'],
  ['user', 'update', 'u'],
  ['user', 'create', '--name', '  ', '--role-id', 'r'],
  ['role', 'update', 'r', '--name', '新'],
  ['role', 'update', 'r', '--permissions', 'tasks.view'],
  [
    'role',
    'update',
    'r',
    '--name',
    '新',
    '--permissions',
    'tasks.view',
    '--clear-permissions',
  ],
  ['role', 'create', '--name', '新', '--permissions', ''],
  ['role', 'create', '--name', '新', '--permissions', 'tasks.view,'],
  ['role', 'create', '--name', '新', '--permissions', 'tasks.view, tasks.view'],
  ['role', 'create', '--name', '新', '--permissions', 'unknown'],
  ['user', 'restore', 'u', '--expected-version', '1'],
  ['role', 'create', '--name', '新', '--clear-permissions'],
  ['user', 'update', 'u', '--name', '新', '--name', '重复'],
  ['role', 'restore', 'r', '--yes'],
  ['user', 'delete', 'u'],
  ['role', 'delete', 'r'],
])('rejects invalid management arguments %s', async (...args) => {
  const result = await invoke([...args, '--json']);
  expect(result.exitCode).toBe(64);
  expect(result.stdout).toBe('');
  expect(requests).toHaveLength(0);
});
/** Deletion confirmation must occur before HTTP, including JSON refusal in a TTY. */
it.each(['user', 'role'])('confirms %s deletion', async (resource) => {
  for (const accepted of [false, true]) {
    requests = [];
    const result = await invoke([resource, 'delete', 'u'], {
      isTTY: true,
      confirm: async (question) => {
        expect(requests).toHaveLength(0);
        expect(question).toContain('u');
        return accepted;
      },
    });
    expect(result.exitCode).toBe(accepted ? 0 : 64);
    expect(requests).toHaveLength(accepted ? 1 : 0);
    if (accepted) {
      expect(result.stdout).toContain('u');
      expect(result.stdout).toContain('已删除');
    }
  }
  requests = [];
  expect(
    (await invoke([resource, 'delete', 'u', '--json'], { isTTY: true }))
      .exitCode,
  ).toBe(64);
  expect(requests).toHaveLength(0);
});
/** Keeps management failures separate from task version reconciliation and never retries. */
it.each(['user', 'role'])(
  'reports %s failures with resource reconciliation',
  async (resource) => {
    for (const [status, exitCode] of [
      [400, 64],
      [401, 77],
      [403, 77],
      [404, 66],
      [409, 75],
      [500, 69],
    ] as const) {
      requests = [];
      respond = () => Response.json(apiError, { status });
      const result = await invoke([resource, 'restore', 'u', '--json']);
      expect(result.exitCode, result.stderr).toBe(exitCode);
      expect(result.stdout).toBe('');
      expect(requests).toHaveLength(1);
      const failure = JSON.parse(result.stderr);
      expect(failure.error.status).toBe(status);
      expect(failure.meta).toEqual({ exitCode });
      if (status === 409)
        expect(failure.error.hint).toContain(`${resource} get`);
      expect(result.stderr).not.toContain('expectedVersion');
    }
    for (const protocol of [false, true]) {
      requests = [];
      respond = () => {
        if (!protocol) throw new TypeError('offline');
        return new Response('<html>', { status: 503 });
      };
      const result = await invoke([resource, 'restore', 'u', '--json']);
      expect(result.exitCode).toBe(protocol ? 65 : 69);
      expect(requests).toHaveLength(1);
      expect(JSON.parse(result.stderr).error.hint).toContain(`${resource} get`);
      const create = await invoke(
        resource === 'user'
          ? ['user', 'create', '--name', '新', '--role-id', 'r', '--json']
          : ['role', 'create', '--name', '新', '--json'],
      );
      expect(JSON.parse(create.stderr).error.hint).toContain(
        `${resource} list`,
      );
    }
  },
);
/** Returned details must be readable and inert even when a remote name contains terminal escapes. */
it.each(['user', 'role'])(
  'renders %s write details safely',
  async (resource) => {
    respond = () =>
      Response.json({
        ...(resource === 'user'
          ? adminOverview.users[0]
          : adminOverview.roles[0]),
        name: '新\u001b[31m',
      });
    const result = await invoke([resource, 'restore', 'u']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('更新时间');
    expect(result.stdout).toContain('\\u001b');
    expect(result.stdout).not.toContain('\u001b');
  },
);
