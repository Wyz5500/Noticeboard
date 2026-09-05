/** Protects demo reset wire semantics and the handwritten public response boundary. */
import { expect, expectTypeOf, it } from 'vitest';
import {
  createNoticeboardClient,
  type DemoResetResult,
} from '../../apps/cli/src/sdk/index.js';
import type { ResetDemoResponseDto } from '../../apps/cli/src/sdk/internal/generated/transport.js';
import { apiError } from './fixtures.js';

/** The artifact specifies a boolean, not the server's current true example. */
it.each([true, false])(
  'retains reset=%s and sends one bodyless POST',
  async (reset) => {
    expectTypeOf<DemoResetResult>().toEqualTypeOf<ResetDemoResponseDto>();
    const requests: Request[] = [];
    const client = createNoticeboardClient({
      baseUrl: 'https://example.test/proxy/',
      getHeaders: async () => ({ 'X-Demo-User-Id': 'operator' }),
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({ reset, extra: 'ignored' });
      },
    });
    expect(await client.demo.reset()).toEqual({ reset });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(
      'https://example.test/proxy/api/v1/demo/reset',
    );
    expect(requests[0]!.method).toBe('POST');
    expect(requests[0]!.headers.get('x-demo-user-id')).toBe('operator');
    expect(await requests[0]!.text()).toBe('');
  },
);

/** Invalid fields and unexpected success statuses cannot masquerade as a completed reset. */
it.each([
  { data: {}, status: 200 },
  { data: { reset: 'true' }, status: 200 },
  { data: { reset: 1 }, status: 200 },
  { data: { reset: null }, status: 200 },
  { data: null, status: 200 },
  { data: [], status: 200 },
  { data: { reset: true }, status: 201 },
  { data: { reset: true }, status: 202 },
])('rejects invalid reset response $data/$status', async ({ data, status }) => {
  let calls = 0;
  const client = createNoticeboardClient({
    baseUrl: 'https://example.test',
    fetch: async () => {
      calls++;
      return Response.json(data, { status });
    },
  });
  await expect(client.demo.reset()).rejects.toMatchObject({
    kind: 'protocol',
    status,
  });
  expect(calls).toBe(1);
});

/** Failures remain classified and never cause a second destructive request. */
it.each(['api', 'network', 'json', 'empty', 'default-cancel', 'call-cancel'])(
  'preserves %s without retrying',
  async (failure) => {
    let calls = 0;
    const client = createNoticeboardClient({
      baseUrl: 'https://example.test',
      ...(failure === 'default-cancel'
        ? { signal: AbortSignal.abort('stop') }
        : {}),
      fetch: async () => {
        calls++;
        if (failure === 'network') throw new TypeError('offline');
        if (failure === 'api') return Response.json(apiError, { status: 403 });
        if (failure === 'empty') return new Response(null, { status: 204 });
        return new Response('<html>', { status: 503 });
      },
    });
    const canceled = failure.endsWith('cancel');
    await expect(
      client.demo.reset(
        failure === 'call-cancel' ? { signal: AbortSignal.abort('stop') } : {},
      ),
    ).rejects.toMatchObject({
      kind:
        failure === 'api'
          ? 'api'
          : failure === 'network' || canceled
            ? 'network'
            : 'protocol',
      ...(failure === 'api' ? { status: 403, code: apiError.error.code } : {}),
      ...(canceled ? { reason: 'aborted', cause: 'stop' } : {}),
    });
    expect(calls).toBe(canceled ? 0 : 1);
  },
);
