/** Protects management wire contracts, response validation and one-shot writes. */
import { expect, expectTypeOf, it } from 'vitest';
import {
  createNoticeboardClient,
  type NoticeboardClient,
  type RequestOptions,
  type CreateAdminUserInput,
  type UpdateAdminUserInput,
  type CreateAdminRoleInput,
  type UpdateAdminRoleInput,
} from '../../apps/cli/src/sdk/index.js';
import type {
  CreateAdminUserDto,
  UpdateAdminUserDto,
  CreateAdminRoleDto,
  UpdateAdminRoleDto,
} from '../../apps/cli/src/sdk/internal/generated/transport.js';
import { adminOverview } from './admin-fixtures.js';
import { apiError } from './fixtures.js';

/** Public inputs must stay wire-compatible without exposing generated declarations. */
it('matches management input contracts', () => {
  expectTypeOf<CreateAdminUserInput>().toEqualTypeOf<CreateAdminUserDto>();
  expectTypeOf<UpdateAdminUserInput>().toEqualTypeOf<UpdateAdminUserDto>();
  expectTypeOf<CreateAdminRoleInput>().toEqualTypeOf<CreateAdminRoleDto>();
  expectTypeOf<UpdateAdminRoleInput>().toEqualTypeOf<UpdateAdminRoleDto>();
});
const cases: {
  name: string;
  method: string;
  path: string;
  status: number;
  body?: unknown;
  result?: unknown;
  call: (c: NoticeboardClient, o?: RequestOptions) => Promise<unknown>;
}[] = [
  {
    name: 'user create',
    method: 'POST',
    path: '/users',
    status: 201,
    body: { name: '新用户', roleId: 'r' },
    result: adminOverview.users[0],
    call: (c, o) => c.admin.users.create({ name: '新用户', roleId: 'r' }, o),
  },
  {
    name: 'user update',
    method: 'PATCH',
    path: '/users/a%2Fb',
    status: 200,
    body: { name: '新用户' },
    result: adminOverview.users[0],
    call: (c, o) => c.admin.users.update('a/b', { name: '新用户' }, o),
  },
  {
    name: 'user delete',
    method: 'DELETE',
    path: '/users/a%2Fb',
    status: 204,
    call: (c, o) => c.admin.users.delete('a/b', o),
  },
  {
    name: 'user restore',
    method: 'POST',
    path: '/users/a%2Fb/restore',
    status: 200,
    result: adminOverview.users[0],
    call: (c, o) => c.admin.users.restore('a/b', o),
  },
  {
    name: 'role create',
    method: 'POST',
    path: '/roles',
    status: 201,
    body: { name: '新角色' },
    result: adminOverview.roles[0],
    call: (c, o) => c.admin.roles.create({ name: '新角色' }, o),
  },
  {
    name: 'role update',
    method: 'PATCH',
    path: '/roles/a%2Fb',
    status: 200,
    body: { name: '新角色', permissions: [] },
    result: adminOverview.roles[0],
    call: (c, o) =>
      c.admin.roles.update('a/b', { name: '新角色', permissions: [] }, o),
  },
  {
    name: 'role delete',
    method: 'DELETE',
    path: '/roles/a%2Fb',
    status: 204,
    call: (c, o) => c.admin.roles.delete('a/b', o),
  },
  {
    name: 'role restore',
    method: 'POST',
    path: '/roles/a%2Fb/restore',
    status: 200,
    result: adminOverview.roles[0],
    call: (c, o) => c.admin.roles.restore('a/b', o),
  },
];
/** Catches routing, header, body, status and empty-response mistakes for every operation. */
it.each(cases)(
  'sends $name once',
  async ({ call, method, path, status, body, result }) => {
    const requests: Request[] = [];
    const client = createNoticeboardClient({
      baseUrl: 'https://example.test/proxy',
      getHeaders: async () => ({ 'X-Demo-User-Id': 'admin' }),
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return status === 204
          ? new Response(null, { status })
          : Response.json({ ...(result as object), extra: true }, { status });
      },
    });
    expect(await call(client)).toEqual(result);
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.url).toBe(`https://example.test/proxy/api/v1/admin${path}`);
    expect(request.method).toBe(method);
    expect(request.headers.get('x-demo-user-id')).toBe('admin');
    expect(await request.text()).toBe(
      body === undefined ? '' : JSON.stringify(body),
    );
  },
);
/** Errors and cancellations must never trigger a second write or implicit read. */
it.each(cases)(
  'preserves failures and cancellation for $name',
  async ({ call, status, result }) => {
    for (const failure of [
      'api',
      'network',
      'json',
      'shape',
      'status',
      'cancel',
    ] as const) {
      if (failure === 'shape' && status === 204) continue;
      let calls = 0;
      const client = createNoticeboardClient({
        baseUrl: 'https://example.test',
        fetch: async () => {
          calls++;
          if (failure === 'network') throw new TypeError('offline');
          if (failure === 'api')
            return Response.json(apiError, { status: 409 });
          if (failure === 'json')
            return new Response('<html>', { status: 503 });
          return Response.json(failure === 'shape' ? {} : (result ?? {}), {
            status: failure === 'status' ? 202 : status,
          });
        },
      });
      await expect(
        call(
          client,
          failure === 'cancel' ? { signal: AbortSignal.abort() } : {},
        ),
      ).rejects.toMatchObject({
        kind:
          failure === 'api'
            ? 'api'
            : failure === 'network' || failure === 'cancel'
              ? 'network'
              : 'protocol',
      });
      expect(calls).toBe(failure === 'cancel' ? 0 : 1);
    }
  },
);
