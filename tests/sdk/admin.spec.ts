/** Exercises management reads through the public SDK and real generated transport. */
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createNoticeboardClient } from '../../apps/cli/src/sdk/index.js';
import { adminOverview } from './admin-fixtures.js';
import { apiError } from './fixtures.js';

/** Supplies only the external HTTP response; all request and decoding code remains real. */
function clientWith(body: unknown, status = 200) {
  return createNoticeboardClient({
    baseUrl: 'https://example.test',
    fetch: async () => Response.json(body, { status }),
  });
}

/** Catches wrong routing, dropped headers, sorting, filtering and accidental extra public fields. */
it('reads a complete management overview with one authenticated GET', async () => {
  const requests: Request[] = [];
  const client = createNoticeboardClient({
    baseUrl: 'https://example.test/proxy/',
    getHeaders: async () => ({ 'X-Demo-User-Id': 'noticeboard-admin' }),
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json({
        ...adminOverview,
        extra: true,
        users: adminOverview.users.map((user) => ({
          ...user,
          secret: 'ignored',
        })),
        roles: adminOverview.roles.map((role) => ({ ...role, extra: true })),
        permissions: adminOverview.permissions.map((permission) => ({
          ...permission,
          extra: true,
        })),
      });
    },
  });
  expect(client).toHaveProperty('admin.overview', expect.any(Function));
  expect(await client.admin.overview()).toEqual(adminOverview);
  expect(requests).toHaveLength(1);
  expect(requests[0]!.url).toBe(
    'https://example.test/proxy/api/v1/admin/overview',
  );
  expect(requests[0]!.method).toBe('GET');
  expect(requests[0]!.headers.get('X-Demo-User-Id')).toBe('noticeboard-admin');
});

/** Empty management collections are valid and must not acquire defaults. */
it('retains empty management collections', async () => {
  const empty = { users: [], roles: [], permissions: [] };
  expect(await clientWith(empty).admin.overview()).toEqual(empty);
});

const artifact = JSON.parse(
  readFileSync('openapi/v1/noticeboard.openapi.json', 'utf8'),
) as {
  components: {
    schemas: Record<
      string,
      {
        properties: Record<string, { nullable?: boolean; enum?: string[] }>;
        required: string[];
      }
    >;
  };
};

/** Derives corruptions from the tracked contract so missing decoder fields cannot silently pass. */
it.each([
  ['AdminOverviewResponseDto', adminOverview, (value: unknown) => value],
  [
    'AdminUserResponseDto',
    adminOverview.users[0]!,
    (value: unknown) => ({
      ...adminOverview,
      users: [adminOverview.users[1], value],
    }),
  ],
  [
    'AdminRoleResponseDto',
    adminOverview.roles[0]!,
    (value: unknown) => ({
      ...adminOverview,
      roles: [adminOverview.roles[1], value],
    }),
  ],
  [
    'PermissionResponseDto',
    adminOverview.permissions[0]!,
    (value: unknown) => ({
      ...adminOverview,
      permissions: [adminOverview.permissions[1], value],
    }),
  ],
] as const)(
  'validates every management field in %s',
  async (name, fixture, wrap) => {
    const schema = artifact.components.schemas[name]!;
    for (const [field, shape] of Object.entries(schema.properties)) {
      const invalid: unknown[] = [{ ...fixture, [field]: {} }];
      if (schema.required.includes(field)) {
        const missing: Record<string, unknown> = { ...fixture };
        delete missing[field];
        invalid.push(missing);
      }
      if (!shape.nullable) invalid.push({ ...fixture, [field]: null });
      if (shape.enum)
        invalid.push({ ...fixture, [field]: 'unknown-permission' });
      for (const body of invalid)
        await expect(
          clientWith(wrap(body)).admin.overview(),
          `${name}.${field}`,
        ).rejects.toMatchObject({ kind: 'protocol', status: 200 });
    }
  },
);

/** Rejects malformed nested members and unknown role permissions even after valid entries. */
it.each([
  { ...adminOverview, users: [adminOverview.users[0], null] },
  {
    ...adminOverview,
    roles: [
      { ...adminOverview.roles[0], permissions: ['tasks.view', 'unknown'] },
    ],
  },
  { ...adminOverview, permissions: [adminOverview.permissions[0], null] },
])('rejects invalid nested management values', async (body) => {
  await expect(clientWith(body).admin.overview()).rejects.toMatchObject({
    kind: 'protocol',
    status: 200,
  });
});

/** Preserves permission failures while distinguishing unexpected success and malformed responses. */
it.each([401, 403])('preserves HTTP %s management errors', async (status) => {
  await expect(
    clientWith(apiError, status).admin.overview(),
  ).rejects.toMatchObject({
    kind: 'api',
    status,
    code: apiError.error.code,
    path: apiError.path,
  });
});

/** Management must use the shared protocol and network classification without retries. */
it.each([
  [() => Response.json(adminOverview, { status: 201 }), 'protocol', 201],
  [
    () => new Response('<html>unavailable</html>', { status: 503 }),
    'protocol',
    503,
  ],
  [
    () => {
      throw new TypeError('offline');
    },
    'network',
    undefined,
  ],
] as const)(
  'classifies management transport failures',
  async (respond, kind, status) => {
    let calls = 0;
    const client = createNoticeboardClient({
      baseUrl: 'https://example.test',
      fetch: async () => {
        calls++;
        return respond();
      },
    });
    await expect(client.admin.overview()).rejects.toMatchObject({
      kind,
      ...(status ? { status } : {}),
    });
    expect(calls).toBe(1);
  },
);

/** A per-call cancellation must reach the generated management request. */
it('cancels an in-flight overview without replaying it', async () => {
  const controller = new AbortController();
  let calls = 0;
  const client = createNoticeboardClient({
    baseUrl: 'https://example.test',
    fetch: async (_input, init) => {
      calls++;
      return new Promise((_resolve, reject) => {
        init!.signal!.addEventListener(
          'abort',
          () => reject(new DOMException('cancelled', 'AbortError')),
          { once: true },
        );
        controller.abort(new Error('cancel overview'));
      });
    },
  });
  await expect(
    client.admin.overview({ signal: controller.signal }),
  ).rejects.toMatchObject({ kind: 'network', reason: 'aborted' });
  expect(calls).toBe(1);
});
