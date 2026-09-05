/** Exercises CLI public behavior with real config files and the real HTTP SDK. */
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runCli, type CliContext } from '../../apps/cli/src/run.js';
import type { Config } from '../../apps/cli/src/config.js';
import { adminOverview } from '../sdk/admin-fixtures.js';
import {
  activity,
  apiError,
  comment,
  identity,
  task,
} from '../sdk/fixtures.js';

let directory: string;
let configFile: string;
let env: NodeJS.ProcessEnv;
let requests: { url: string; user: string | null }[];
let response: (url: string) => Response;

/** Isolates every config mutation and records requests at the actual SDK fetch boundary. */
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'noticeboard-cli-'));
  configFile = join(directory, 'config.json');
  env = { NOTICEBOARD_CONFIG_FILE: configFile };
  requests = [];
  response = (url) =>
    Response.json(
      url.endsWith('/demo/users')
        ? [identity]
        : url.endsWith('/tasks')
          ? [task]
          : task,
    );
});

/** Removes only temporary files owned by this test. */
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

/** Runs the real dispatcher while keeping all user output and confirmation observable. */
async function invoke(args: string[], overrides: Partial<CliContext> = {}) {
  let stdout = '';
  let stderr = '';
  const exitCode = await runCli(args, {
    env,
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
    fetch: async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      requests.push({
        url,
        user: new Headers(init?.headers).get('X-Demo-User-Id'),
      });
      return response(url);
    },
    ...overrides,
  });
  return { exitCode, stdout, stderr };
}

/** Reads the persisted schema without deriving expectations through production helpers. */
async function saved(): Promise<Config> {
  return JSON.parse(await readFile(configFile, 'utf8')) as Config;
}

/** Management reads must select the right collection through one overview request and never persist overrides. */
it.each([
  ['admin', 'overview', adminOverview],
  ['user', 'list', adminOverview.users],
  ['role', 'list', adminOverview.roles],
  ['permission', 'list', adminOverview.permissions],
] as const)(
  'reads %s %s as JSON without configuration writes',
  async (resource, action, data) => {
    response = () => Response.json(adminOverview);
    env.NOTICEBOARD_USER = 'noticeboard-master';
    env.NOTICEBOARD_BASE_URL = 'https://ignored.test';
    const result = await invoke([
      resource,
      action,
      '--json',
      '--base-url',
      'https://admin.test/proxy',
      '--user',
      'noticeboard-admin',
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({ data });
    expect(requests).toEqual([
      {
        url: 'https://admin.test/proxy/api/v1/admin/overview',
        user: 'noticeboard-admin',
      },
    ]);
    expect(await readdir(directory)).toEqual([]);
  },
);

/** Existing profiles supply management identity without being rewritten by successful or rejected reads. */
it('reads management using a selected profile and leaves its bytes unchanged', async () => {
  const contents = JSON.stringify({
    version: 1,
    currentProfile: 'local',
    profiles: {
      local: {
        baseUrl: 'https://local.test',
        demoUserId: 'noticeboard-master',
      },
      admin: { baseUrl: 'https://admin.test', demoUserId: 'noticeboard-admin' },
    },
  });
  await writeFile(configFile, contents);
  response = () => Response.json(adminOverview);
  const result = await invoke([
    'admin',
    'overview',
    '--profile',
    'admin',
    '--json',
  ]);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(requests).toEqual([
    {
      url: 'https://admin.test/api/v1/admin/overview',
      user: 'noticeboard-admin',
    },
  ]);
  expect(await readFile(configFile, 'utf8')).toBe(contents);
});

/** New resource help must work offline even with corrupt configuration. */
it.each(['admin', 'user', 'role', 'permission'])(
  'shows offline %s help',
  async (resource) => {
    await writeFile(configFile, 'broken');
    const result = await invoke([resource, '--help']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      `noticeboard ${resource} ${resource === 'admin' ? 'overview' : 'list'}`,
    );
    expect(requests).toEqual([]);
  },
);

/** Management commands reject invalid filters and operands before HTTP. */
it.each([
  ['user', 'get'],
  ['role', 'get', 'role-z', '--search', 'admin'],
  ['permission', 'get', 'system.manage', 'extra'],
  ['permission', 'list', '--active', 'true'],
  ['user', 'list', '--active', 'yes'],
  ['role', 'list', '--deleted', 'FALSE'],
  ['role', 'list', '--active'],
  ['user', 'list', '--deleted', 'all', '--deleted', 'false'],
  ['user', 'list', '--search', 'a', '--search', 'b'],
  ['admin', 'overview', '--search', 'a'],
  ['user', 'list', '--status', 'closed'],
  ['permission', 'list', 'extra'],
  ['admin', 'overview', '--yes'],
  ['user', 'list', '--user', 'a', '--user', 'b'],
])('rejects invalid management arguments %j before HTTP', async (...args) => {
  expect((await invoke(args)).exitCode).toBe(64);
  expect(requests).toEqual([]);
});

/** Permission and transport failures must not leak success data or trigger identity fallback. */
it.each([
  [401, apiError, 77],
  [403, apiError, 77],
  [200, {}, 65],
] as const)(
  'reports management HTTP %s failures only on stderr',
  async (status, body, exitCode) => {
    response = () => Response.json(body, { status });
    const result = await invoke(['user', 'list', '--json']);
    expect(result.exitCode).toBe(exitCode);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toMatchObject({ meta: { exitCode } });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.user).toBe('noticeboard-master');
    expect(await readdir(directory)).toEqual([]);
  },
);

/** Render all three management tables, preserving deleted rows and escaping remote terminal controls. */
it('renders management tables with inert user content and explicit empty states', async () => {
  response = () =>
    Response.json({
      ...adminOverview,
      users: [
        { ...adminOverview.users[0], name: '\u001b[31m危险\n姓名' },
        adminOverview.users[1],
      ],
    });
  const result = await invoke(['admin', 'overview']);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stdout).toContain('user-a');
  expect(result.stdout).toContain('2026-09-02T00:00:00.000Z');
  expect(result.stdout).toContain('\\u001b[31m危险\\u000a姓名');
  expect(result.stdout).not.toContain('\u001b');
  expect(result.stdout).toContain('role-z');
  expect(result.stdout).toContain('system.manage');
  for (const resource of ['user', 'role', 'permission']) {
    const list = await invoke([resource, 'list']);
    expect(list.exitCode, list.stderr).toBe(0);
    expect(list.stdout).toContain(
      resource === 'user'
        ? 'user-z'
        : resource === 'role'
          ? 'role-z'
          : 'system.manage',
    );
  }
  response = () => Response.json({ users: [], roles: [], permissions: [] });
  const empty = await invoke(['admin', 'overview']);
  expect(empty.stdout).toContain('无用户');
  expect(empty.stdout).toContain('无角色');
  expect(empty.stdout).toContain('无权限');
});

/** Missing config must not cause implicit writes or require network access for help. */
it('shows help without loading damaged config or requesting HTTP', async () => {
  await writeFile(configFile, '{');
  const result = await invoke(['task', '--help']);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('task list');
  expect(result.stderr).toBe('');
  expect(requests).toEqual([]);
});

/** Defaults are command-local and JSON is a single clean value. */
it('reads tasks using demo defaults without creating a config file', async () => {
  const result = await invoke(['task', 'list', '--json']);
  expect(result).toMatchObject({ exitCode: 0, stderr: '' });
  expect(JSON.parse(result.stdout)).toEqual({ data: [task] });
  expect(requests).toEqual([
    { url: 'http://127.0.0.1:3000/api/v1/tasks', user: 'noticeboard-master' },
  ]);
  expect(await readdir(directory)).toEqual([]);
});

/** Strict usage validation must happen before HTTP or config writes. */
it.each([
  ['task', 'create'],
  ['task', 'get'],
  ['task', 'list', 'extra'],
  ['task', 'list', '--wat'],
  ['task', 'list', '--status', '进行中'],
  ['task', 'list', '--user', 'a', '--user', 'b'],
  ['task', 'get', 'a', '--mine'],
  ['profile', 'set', 'x'],
  ['task', 'list', '--base-url', 'https://user:secret@example.test'],
  ['task', 'list', '--user', ''],
  ['--mine'],
  ['constructor'],
  ['toString'],
  ['__proto__'],
])('rejects invalid arguments %j', async (...args) => {
  const result = await invoke([...args, '--json']);
  expect(result.exitCode).toBe(64);
  expect(result.stdout).toBe('');
  expect(JSON.parse(result.stderr)).toMatchObject({
    error: { kind: 'usage' },
    meta: { exitCode: 64 },
  });
  expect(requests).toEqual([]);
  expect(await readdir(directory)).toEqual([]);
});

/** Explicit profile creation must preserve active state and avoid persisting ambient overrides. */
it('sets profiles, switches explicitly, and keeps omitted identities', async () => {
  env.NOTICEBOARD_USER = 'ambient';
  expect(
    (
      await invoke([
        'profile',
        'set',
        'remote',
        '--base-url',
        'https://example.test/prefix/',
        '--user',
        'user-1',
      ])
    ).exitCode,
  ).toBe(0);
  expect(await saved()).toEqual({
    version: 1,
    currentProfile: 'local',
    profiles: {
      local: {
        baseUrl: 'http://127.0.0.1:3000',
        demoUserId: 'noticeboard-master',
      },
      remote: { baseUrl: 'https://example.test/prefix', demoUserId: 'user-1' },
    },
  });
  await invoke([
    'profile',
    'set',
    'remote',
    '--base-url',
    'https://other.test',
  ]);
  expect((await saved()).profiles.remote!.demoUserId).toBe('user-1');
  await invoke(['profile', 'use', 'remote']);
  expect((await saved()).currentProfile).toBe('remote');
  if (process.platform !== 'win32')
    expect((await stat(configFile)).mode & 0o777).toBe(0o600);
  expect(await readdir(directory)).toEqual(['config.json']);
});

/** Request overrides must never mutate stored profiles. */
it('resolves flags above environment above selected profile without writeback', async () => {
  await invoke([
    'profile',
    'set',
    'remote',
    '--base-url',
    'https://profile.test',
    '--user',
    'profile-user',
  ]);
  const before = await readFile(configFile, 'utf8');
  env.NOTICEBOARD_PROFILE = 'remote';
  await invoke(['task', 'list']);
  env.NOTICEBOARD_BASE_URL = 'https://env.test';
  env.NOTICEBOARD_USER = 'env-user';
  await invoke(['task', 'list']);
  await invoke([
    '--profile',
    'local',
    'task',
    'get',
    'a/b ?',
    '--base-url',
    'https://flag.test/prefix',
    '--user',
    'flag-user',
  ]);
  expect(requests).toEqual([
    { url: 'https://profile.test/api/v1/tasks', user: 'profile-user' },
    { url: 'https://env.test/api/v1/tasks', user: 'env-user' },
    {
      url: 'https://flag.test/prefix/api/v1/tasks/a%2Fb%20%3F',
      user: 'flag-user',
    },
  ]);
  expect(await readFile(configFile, 'utf8')).toBe(before);
});

/** A damaged configuration must never be replaced by defaults. */
it.each([
  '{',
  '{"version":2}',
  '{"version":1,"currentProfile":"gone","profiles":{}}',
  '{"version":1,"currentProfile":"x","profiles":{"x":{"baseUrl":4}}}',
])('preserves invalid config %s', async (raw) => {
  await writeFile(configFile, raw);
  const result = await invoke([
    'profile',
    'set',
    'remote',
    '--base-url',
    'https://example.test',
    '--json',
  ]);
  expect(result.exitCode).toBe(64);
  expect(JSON.parse(result.stderr).error.kind).toBe('config');
  expect(await readFile(configFile, 'utf8')).toBe(raw);
});

/** Deleting the active entry can never silently select another profile. */
it('rejects active deletion even with yes and requires non-TTY consent', async () => {
  await invoke([
    'profile',
    'set',
    'remote',
    '--base-url',
    'https://example.test',
  ]);
  const before = await readFile(configFile, 'utf8');
  expect((await invoke(['profile', 'delete', 'local', '--yes'])).exitCode).toBe(
    64,
  );
  expect((await invoke(['profile', 'delete', 'remote'])).exitCode).toBe(64);
  expect(await readFile(configFile, 'utf8')).toBe(before);
  expect(
    (await invoke(['profile', 'delete', 'remote', '--yes'])).exitCode,
  ).toBe(0);
  expect((await saved()).currentProfile).toBe('local');
  expect(Object.keys((await saved()).profiles)).toEqual(['local']);
});

/** Declining a TTY confirmation must preserve the entire file. */
it('honors declined and accepted TTY deletion', async () => {
  await invoke([
    'profile',
    'set',
    'remote',
    '--base-url',
    'https://example.test',
  ]);
  const before = await readFile(configFile, 'utf8');
  const declined = await invoke(['profile', 'delete', 'remote'], {
    isTTY: true,
    confirm: async () => false,
  });
  expect(declined.exitCode).toBe(64);
  expect(await readFile(configFile, 'utf8')).toBe(before);
  expect(
    (
      await invoke(['profile', 'delete', 'remote'], {
        isTTY: true,
        confirm: async () => true,
      })
    ).exitCode,
  ).toBe(0);
});

/** JSON mode must never mix interactive prompts into its error stream. */
it('requires yes for JSON deletion even in a TTY', async () => {
  await invoke([
    'profile',
    'set',
    'remote',
    '--base-url',
    'https://example.test',
  ]);
  const result = await invoke(['profile', 'delete', 'remote', '--json'], {
    isTTY: true,
  });
  expect(result.exitCode).toBe(64);
  expect(JSON.parse(result.stderr).error.kind).toBe('usage');
});

/** Effective identity normalization must agree with Fetch without rewriting stored profiles. */
it.each(
  ['flag', 'environment', 'profile'].flatMap((source) =>
    ['current', 'mine'].map((operation) => [source, operation]),
  ),
)('uses the wire identity from %s for %s', async (source, operation) => {
  await invoke([
    'profile',
    'set',
    'local',
    '--base-url',
    'https://example.test',
    '--user',
    source === 'profile' ? ' user-1 ' : 'user-1',
  ]);
  const before = await readFile(configFile, 'utf8');
  if (source === 'environment') env.NOTICEBOARD_USER = ' user-1 ';
  const options = source === 'flag' ? ['--user', ' user-1 '] : [];
  const result = await invoke([
    ...(operation === 'current'
      ? ['identity', 'current']
      : ['task', 'list', '--mine']),
    '--json',
    ...options,
  ]);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    data: operation === 'current' ? identity : [task],
  });
  expect(requests.map((request) => request.user)).toEqual(
    operation === 'current' ? ['user-1'] : ['user-1', 'user-1'],
  );
  expect(await readFile(configFile, 'utf8')).toBe(before);
});

/** Identity switching persists only validated users in the active profile. */
it('validates identity selection and rejects a non-active profile target', async () => {
  expect((await invoke(['identity', 'use', 'user-1'])).exitCode).toBe(0);
  expect((await saved()).profiles.local!.demoUserId).toBe('user-1');
  const before = await readFile(configFile, 'utf8');
  expect((await invoke(['identity', 'use', 'missing'])).exitCode).toBe(77);
  expect(await readFile(configFile, 'utf8')).toBe(before);
  const current = await invoke(['identity', 'current', '--json']);
  expect(JSON.parse(current.stdout)).toEqual({ data: identity });
  expect(
    (await invoke(['identity', 'current', '--user', 'missing'])).exitCode,
  ).toBe(77);
  await invoke([
    'profile',
    'set',
    'remote',
    '--base-url',
    'https://example.test',
  ]);
  expect(
    (await invoke(['identity', 'use', 'user-1', '--profile', 'remote']))
      .exitCode,
  ).toBe(64);
});

/** Mine must skip both comments and lifecycle actors absent from the active directory. */
it('combines mine, status and normalized search without changing request URLs or order', async () => {
  const other = { ...identity, id: 'deleted-user' };
  const matching = {
    ...task,
    title: 'CLI Guide',
    timeline: [
      activity,
      { ...activity, actor: other, sequence: 2 },
      { ...comment, actor: other, sequence: 3 },
    ],
  };
  response = (url) =>
    Response.json(
      url.endsWith('/demo/users')
        ? [identity]
        : [
            matching,
            { ...task, id: 'excluded', timeline: [] },
            { ...matching, id: 'second' },
          ],
    );
  const result = await invoke([
    'task',
    'list',
    '--mine',
    '--status',
    'in_progress',
    '--search',
    ' cli ',
    '--user',
    'user-1',
    '--json',
  ]);
  expect(
    JSON.parse(result.stdout).data.map((item: { id: string }) => item.id),
  ).toEqual(['task-1', 'second']);
  expect(requests.map((request) => request.url).sort()).toEqual([
    'http://127.0.0.1:3000/api/v1/demo/users',
    'http://127.0.0.1:3000/api/v1/tasks',
  ]);
});

/** Search corpus is fixed and never expands to comment bodies or rewards. */
it.each(['只读客户端', '探索', '完整合同', '演示成员'])(
  'searches documented field %s',
  async (term) => {
    const result = await invoke(['task', 'list', '--search', term, '--json']);
    expect(JSON.parse(result.stdout).data).toHaveLength(1);
  },
);

/** An empty match remains a successful empty array. */
it.each(['编辑后的正文', '测试奖励'])(
  'excludes non-searchable content %s',
  async (term) => {
    const result = await invoke(['task', 'list', '--search', term, '--json']);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ data: [] });
  },
);

/** Human output remains human on pipes and cannot execute terminal escape sequences. */
it('shows actionable task fields and escapes terminal controls', async () => {
  response = () =>
    Response.json([{ ...task, title: '\u001b[31munsafe\nline' }]);
  const result = await invoke(['task', 'list']);
  for (const text of ['task-1', '进行中', '2026-09-02', '4'])
    expect(result.stdout).toContain(text);
  expect(result.stdout).not.toContain('\u001b');
  expect(result.stdout).toContain('\\u001b');
  expect(result.stderr).toBe('');
});

/** Open server codes and metadata must survive stable status-based exit mappings. */
it.each([
  [400, 64],
  [401, 77],
  [403, 77],
  [404, 66],
  [409, 75],
  [429, 75],
  [500, 69],
  [503, 69],
  [418, 1],
])('maps HTTP %i to exit %i', async (status, exitCode) => {
  response = () => Response.json(apiError, { status });
  const result = await invoke(['task', 'get', 'missing', '--json']);
  expect(result.exitCode).toBe(exitCode);
  expect(result.stdout).toBe('');
  expect(JSON.parse(result.stderr)).toMatchObject({
    error: {
      kind: 'api',
      code: 'FUTURE_ERROR',
      status,
      path: apiError.path,
      timestamp: apiError.timestamp,
      details: { version: 4 },
    },
    meta: { exitCode },
  });
  expect(requests).toHaveLength(1);
});

/** Invalid HTTP bodies are protocol errors even when their status is 503. */
it('maps HTML 503 to protocol failure', async () => {
  response = () => new Response('<h1>unavailable</h1>', { status: 503 });
  const result = await invoke(['task', 'list', '--json']);
  expect(result.exitCode).toBe(65);
  expect(JSON.parse(result.stderr).error).toMatchObject({
    kind: 'protocol',
    status: 503,
  });
});

/** An invalid server identity keeps its API diagnostics and offers an actionable selection path. */
it('suggests identity selection after an HTTP 401', async () => {
  response = () => Response.json(apiError, { status: 401 });
  const result = await invoke(['task', 'list']);
  expect(result.exitCode).toBe(77);
  expect(result.stderr).toContain('identity list');
  expect(result.stderr).toContain('identity use');
  expect(result.stderr).toContain('FUTURE_ERROR');
});

/** Connection failures must terminate with no retries. */
it('maps connection failure to 69', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockRejectedValue(new TypeError('offline'));
  const result = await invoke(['task', 'list', '--json'], { fetch });
  expect(result.exitCode).toBe(69);
  expect(JSON.parse(result.stderr).error.kind).toBe('network');
  expect(fetch).toHaveBeenCalledTimes(1);
});

/** Profile results expose saved values, while human identity output uses readable labels. */
it('lists and shows stored profiles and human identities', async () => {
  await invoke([
    'profile',
    'set',
    'remote',
    '--base-url',
    'https://example.test',
  ]);
  const list = await invoke(['profile', 'list', '--json']);
  expect(
    JSON.parse(list.stdout).data.map(
      (profile: { name: string }) => profile.name,
    ),
  ).toEqual(['local', 'remote']);
  env.NOTICEBOARD_BASE_URL = 'https://override.test';
  const shown = await invoke(['profile', 'show', 'remote', '--json']);
  expect(JSON.parse(shown.stdout)).toEqual({
    data: {
      name: 'remote',
      baseUrl: 'https://example.test',
      demoUserId: 'noticeboard-master',
      current: false,
    },
  });
  const human = await invoke(['identity', 'list']);
  expect(human.stdout).toContain('身份 ID');
  expect(human.stdout).toContain('演示成员');
  expect(human.stdout).toContain('user-1');
});

/** A misspelled profile selector must fail rather than quietly using defaults. */
it.each([
  ['task', 'list', '--profile', 'missing'],
  ['profile', 'show', 'missing'],
  ['profile', 'use', 'missing'],
  ['profile', 'delete', 'missing', '--yes'],
])('rejects missing profiles %j', async (...args) => {
  const result = await invoke([...args, '--json']);
  expect(result.exitCode).toBe(64);
  expect(JSON.parse(result.stderr).error.kind).toBe('config');
  expect(await readdir(directory)).toEqual([]);
});

/** Task details retain public tombstones without printing null as comment content. */
it('renders task details and deleted comment placeholders', async () => {
  const result = await invoke(['task', 'get', 'task-1']);
  expect(result.stdout).toContain('描述：完整合同');
  expect(result.stdout).toContain('[评论已删除]');
  expect(result.stdout).toContain('[已编辑]');
});

/** Expiry reaches the SDK cancellation path, with one bounded request and no replay. */
it('cancels a stalled request after the configured timeout', async () => {
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  const timeout = vi
    .spyOn(AbortSignal, 'timeout')
    .mockImplementation(() => nativeTimeout(5));
  let attempts = 0;
  const result = await invoke(['task', 'list', '--json'], {
    fetch: async (_input, init) => {
      attempts += 1;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('timeout', 'AbortError')),
          { once: true },
        );
      });
    },
  });
  expect(result.exitCode).toBe(69);
  expect(JSON.parse(result.stderr).error).toMatchObject({
    kind: 'network',
    reason: 'aborted',
  });
  expect(attempts).toBe(1);
  expect(timeout).toHaveBeenCalledWith(30_000);
});

/** Details preserve the complete selected resource, including deleted rows, through one authorized request. */
it.each([
  ['user', 'user-z', adminOverview.users[0]],
  ['user', 'user-a', adminOverview.users[1]],
  ['role', 'role-z', adminOverview.roles[0]],
  ['role', 'role-a', adminOverview.roles[1]],
  ['permission', 'system.manage', adminOverview.permissions[0]],
] as const)(
  'reads %s detail %s without persisting configuration',
  async (resource, id, data) => {
    response = () => Response.json(adminOverview);
    const result = await invoke([
      resource,
      'get',
      id,
      '--user',
      'noticeboard-admin',
      '--json',
    ]);
    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: `${JSON.stringify({ data })}\n`,
    });
    expect(requests).toEqual([
      {
        url: 'http://127.0.0.1:3000/api/v1/admin/overview',
        user: 'noticeboard-admin',
      },
    ]);
    expect(await readdir(directory)).toEqual([]);
  },
);

/** Exact keys must not silently match a name, a different case or an absent resource. */
it.each([
  ['user', 'USER-Z'],
  ['user', '管理员'],
  ['user', ' user-z '],
  ['role', 'admin'],
  ['permission', 'TASKS.VIEW'],
  ['permission', 'missing'],
])(
  'reports missing %s detail %s without inventing an HTTP error',
  async (resource, id) => {
    response = () => Response.json(adminOverview);
    const result = await invoke([resource, 'get', id, '--json']);
    expect(result.exitCode).toBe(66);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: { kind: 'usage', message: expect.any(String) },
      meta: { exitCode: 66 },
    });
    expect(requests).toHaveLength(1);
  },
);

/** Search and independent state filters narrow results without changing order or the HTTP query. */
it.each([
  ['user', ['--search', ' USER-Z '], ['user-z']],
  ['user', ['--search', '管理员'], ['user-z']],
  ['user', ['--search', 'role-a'], ['user-a']],
  ['user', ['--search', 'CUSTOM'], ['user-a']],
  ['user', ['--search', '自定义角色'], ['user-a']],
  ['user', ['--search', '   '], ['user-z', 'user-a']],
  ['user', ['--active', 'true'], ['user-z']],
  ['user', ['--active', 'false'], ['user-a']],
  ['user', ['--deleted', 'true'], ['user-a']],
  ['user', ['--deleted', 'false'], ['user-z']],
  ['user', ['--active', 'all', '--deleted', 'all'], ['user-z', 'user-a']],
  ['user', ['--active', 'true', '--deleted', 'true'], []],
  ['user', ['--search', '管理员', '--active', 'false'], []],
  ['role', ['--search', 'ROLE-A'], ['role-a']],
  ['role', ['--search', 'ADMIN'], ['role-z']],
  ['role', ['--search', '自定义角色'], ['role-a']],
  ['role', ['--search', 'TASKS.VIEW'], ['role-z']],
  ['role', ['--active', 'false', '--deleted', 'true'], ['role-a']],
  ['role', ['--active', 'true', '--deleted', 'false'], ['role-z']],
  ['role', ['--active', 'all', '--deleted', 'all'], ['role-z', 'role-a']],
  ['permission', ['--search', ' SYSTEM.MANAGE '], ['system.manage']],
  ['permission', ['--search', '查看任务'], ['tasks.view']],
  ['permission', ['--search', '管理用户与角色'], ['system.manage']],
  ['permission', ['--search', 'no-match'], []],
] as const)('filters %s with %j', async (resource, options, keys) => {
  response = () => Response.json(adminOverview);
  const result = await invoke([resource, 'list', ...options, '--json']);
  expect(result.exitCode, result.stderr).toBe(0);
  const body = JSON.parse(result.stdout) as {
    data: { id?: string; code?: string }[];
  };
  expect(Object.keys(body)).toEqual(['data']);
  expect(
    body.data.map(
      (item: { id?: string; code?: string }) => item.id ?? item.code,
    ),
  ).toEqual(keys);
  expect(requests).toEqual([
    {
      url: 'http://127.0.0.1:3000/api/v1/admin/overview',
      user: 'noticeboard-master',
    },
  ]);
  expect(await readdir(directory)).toEqual([]);
});

/** Disabled and deleted are separate server fields, and search includes username independently of ID. */
it('filters disabled live users without treating them as deleted', async () => {
  response = () =>
    Response.json({
      ...adminOverview,
      users: [
        { ...adminOverview.users[0], username: 'UniqueHandle', active: false },
        adminOverview.users[1],
      ],
    });
  const result = await invoke([
    'user',
    'list',
    '--active',
    'false',
    '--deleted',
    'false',
    '--search',
    'uniquehandle',
    '--json',
  ]);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).data).toEqual([
    expect.objectContaining({ id: 'user-z', active: false, deletedAt: null }),
  ]);
});

/** Human details expose every declared field and escape controls instead of executing terminal sequences. */
it.each([
  [
    'user',
    'user-z',
    ['用户名', '角色代码', 'admin', '更新时间', '2026-09-01T00:00:00.000Z'],
  ],
  [
    'role',
    'role-z',
    ['内置', '权限码', 'tasks.view', '更新时间', '2026-09-01T00:00:00.000Z'],
  ],
  ['permission', 'system.manage', ['代码', '描述', '管理用户与角色']],
] as const)(
  'renders complete %s detail safely',
  async (resource, id, fields) => {
    response = () =>
      Response.json({
        users: adminOverview.users.map((item) => ({
          ...item,
          name: '\u001b[31m危险\n姓名',
        })),
        roles: adminOverview.roles.map((item) => ({
          ...item,
          name: '\u001b[31m危险\n姓名',
        })),
        permissions: adminOverview.permissions.map((item) => ({
          ...item,
          name: '\u001b[31m危险\n姓名',
        })),
      });
    const result = await invoke([resource, 'get', id]);
    expect(result.exitCode, result.stderr).toBe(0);
    for (const field of fields) expect(result.stdout).toContain(field);
    expect(result.stdout).toContain('\\u001b[31m危险\\u000a姓名');
    expect(result.stdout).not.toContain('\u001b');
  },
);

/** Details and filters must not skip validation of unrelated overview collections or permission failures. */
it.each([
  ['user', 'get', 'user-z'],
  ['role', 'list', '--search', 'no-match'],
  ['permission', 'get', 'missing'],
])('preserves management failures for %j', async (...args) => {
  for (const [body, status, exitCode] of [
    [{ ...adminOverview, roles: [{}] }, 200, 65],
    [apiError, 401, 77],
    [apiError, 403, 77],
  ] as const) {
    requests = [];
    response = () => Response.json(body, { status });
    const result = await invoke([...args, '--json']);
    expect(result.exitCode).toBe(exitCode);
    expect(result.stdout).toBe('');
    expect(requests).toHaveLength(1);
  }
  requests = [];
  response = () => {
    throw new TypeError('offline');
  };
  expect((await invoke([...args, '--json'])).exitCode).toBe(69);
  expect(requests).toHaveLength(1);
  expect(await readdir(directory)).toEqual([]);
});

/** New detail help remains usable with damaged configuration and no positional key. */
it.each(['user', 'role', 'permission'])(
  'shows offline %s detail help',
  async (resource) => {
    await writeFile(configFile, 'broken');
    const result = await invoke([resource, 'get', '--help', '--json']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).data.help).toContain(
      `noticeboard ${resource} get`,
    );
    expect(JSON.parse(result.stdout).data.help).toContain('--search');
    expect(requests).toEqual([]);
  },
);
