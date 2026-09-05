/** Tests the public read-only SDK at its real generated transport and Fetch boundary. */
import { describe, expect, expectTypeOf, it } from 'vitest';
import * as sdk from '../../apps/cli/src/sdk/index.js';
import { apiError, identity, task } from './fixtures.js';

/** Captures actual outgoing requests while substituting only the external HTTP service. */
function service(body: unknown = [], status = 200) {
  const requests: Request[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    requests.push(new Request(input, init));
    return Response.json(body, { status });
  };
  return { fetch, requests };
}

describe('read-only SDK public contract', () => {
  /** Prevents generated operations and server-only resources from leaking into the public runtime. */
  it('exports only the factory and stable errors', () => {
    expect(Object.keys(sdk).sort()).toEqual([
      'NoticeboardApiError',
      'NoticeboardNetworkError',
      'NoticeboardProtocolError',
      'createNoticeboardClient',
    ]);
  });

  /** Preserves wire resource semantics without exposing transport status wrappers or generated types. */
  it('reads all resources and preserves task order, dates, versions and timeline projections', async () => {
    const remote = service([task, { ...task, id: 'task-0' }]);
    const client = sdk.createNoticeboardClient({
      baseUrl: 'https://example.test/proxy///',
      fetch: remote.fetch,
    });
    expectTypeOf<typeof client.tasks.list>().returns.toEqualTypeOf<
      Promise<sdk.Task[]>
    >();
    const tasks = await client.tasks.list();
    expect(tasks).toEqual([task, { ...task, id: 'task-0' }]);
    expectTypeOf(tasks[0]!.dueDate).toEqualTypeOf<string>();
    expectTypeOf(tasks[0]!.assignee).toEqualTypeOf<sdk.Identity | null>();
    const detail = service(task);
    expect(
      await sdk
        .createNoticeboardClient({
          baseUrl: 'https://example.test',
          fetch: detail.fetch,
        })
        .tasks.get('a/b ?#中'),
    ).toEqual(task);
    expect(detail.requests[0]!.url).toBe(
      'https://example.test/api/v1/tasks/a%2Fb%20%3F%23%E4%B8%AD',
    );
    const users = service([identity]);
    expect(
      await sdk
        .createNoticeboardClient({
          baseUrl: 'https://example.test',
          fetch: users.fetch,
        })
        .identities.list(),
    ).toEqual([identity]);
    expect(users.requests[0]!.url).toBe(
      'https://example.test/api/v1/demo/users',
    );
    expect(remote.requests[0]!.url).toBe(
      'https://example.test/proxy/api/v1/tasks',
    );
    expect(remote.requests[0]!.method).toBe('GET');
    expect(remote.requests[0]!.headers.has('x-demo-user-id')).toBe(false);
  });

  /** Prevents accidental defaults, caching and cross-instance authentication leakage. */
  it('resolves headers per call and isolates concurrent instances', async () => {
    const remote = service();
    const headers = new Headers({ 'X-Demo-User-Id': 'first' });
    const first = sdk.createNoticeboardClient({
      baseUrl: 'https://one.test',
      fetch: remote.fetch,
      getHeaders: async () => headers,
    });
    const second = sdk.createNoticeboardClient({
      baseUrl: 'https://two.test',
      fetch: remote.fetch,
      getHeaders: () => ({ 'x-demo-user-id': 'second' }),
    });
    expect(
      await Promise.all([first.tasks.list(), second.tasks.list()]),
    ).toEqual([[], []]);
    headers.set('X-Demo-User-Id', 'changed');
    await first.tasks.list();
    expect(
      remote.requests.map((r) => [r.url, r.headers.get('x-demo-user-id')]),
    ).toEqual([
      ['https://one.test/api/v1/tasks', 'first'],
      ['https://two.test/api/v1/tasks', 'second'],
      ['https://one.test/api/v1/tasks', 'changed'],
    ]);
    expect([...headers]).toEqual([['x-demo-user-id', 'changed']]);
  });

  /** Rejects ambiguous destinations at construction, before any HTTP side effects. */
  it.each([
    'relative',
    'ftp://example.test',
    'https://u:p@example.test',
    'https://example.test?q=x',
    'https://example.test/#x',
    'https://example.test?',
    'https://example.test#',
  ])('rejects invalid base URL %s', (baseUrl) => {
    expect(() => sdk.createNoticeboardClient({ baseUrl })).toThrow(TypeError);
  });

  /** Keeps authentication provider defects distinguishable from transport failures. */
  it('propagates provider failures without making a request', async () => {
    const remote = service();
    const failure = new Error('provider failed');
    const client = sdk.createNoticeboardClient({
      baseUrl: 'https://example.test',
      fetch: remote.fetch,
      getHeaders: () => {
        throw failure;
      },
    });
    await expect(client.tasks.list()).rejects.toBe(failure);
    expect(remote.requests).toHaveLength(0);
  });
});

describe('SDK errors and cancellation', () => {
  /** Retains open server codes and statuses outside the generated operation response union without retries. */
  it.each([400, 401, 403, 404, 409, 429, 500, 503])(
    'preserves HTTP %i API errors',
    async (status) => {
      const remote = service({ ...apiError, extra: true }, status);
      const client = sdk.createNoticeboardClient({
        baseUrl: 'https://example.test',
        fetch: remote.fetch,
      });
      const error = await client.tasks
        .get('task-1')
        .catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(sdk.NoticeboardApiError);
      expect(error).toMatchObject({
        kind: 'api',
        status,
        ...apiError.error,
        path: apiError.path,
        timestamp: apiError.timestamp,
      });
      expect(remote.requests).toHaveLength(1);
    },
  );

  /** Distinguishes invalid JSON and contract failures from connection failures, retaining the HTTP status. */
  it.each([
    [200, '{'],
    [503, '<html>down</html>'],
    [200, ''],
    [200, '{}'],
    [201, '[]'],
    [204, null],
    [500, '{}'],
    [401, JSON.stringify({ error: { code: 1, message: 'bad' } })],
  ])(
    'reports protocol failures for status %i body %s',
    async (status, body) => {
      const client = sdk.createNoticeboardClient({
        baseUrl: 'https://example.test',
        fetch: async () => new Response(body, { status }),
      });
      await expect(client.tasks.list()).rejects.toMatchObject({
        kind: 'protocol',
        status,
      });
    },
  );

  /** Wraps failures at the Fetch boundary even when an injected Fetch rejects with a SyntaxError. */
  it('preserves network causes and never retries', async () => {
    const cause = new SyntaxError('fetch implementation failed');
    let calls = 0;
    const client = sdk.createNoticeboardClient({
      baseUrl: 'https://example.test',
      fetch: async () => {
        calls++;
        throw cause;
      },
    });
    await expect(client.tasks.list()).rejects.toMatchObject({
      kind: 'network',
      reason: 'network',
      cause,
    });
    expect(calls).toBe(1);
  });

  /** Body stream failures are transport failures rather than malformed JSON. */
  it('classifies a broken response body as a network error', async () => {
    const cause = new TypeError('connection closed');
    const client = sdk.createNoticeboardClient({
      baseUrl: 'https://example.test',
      fetch: async () =>
        new Response(
          new ReadableStream({
            start: (controller) => controller.error(cause),
          }),
        ),
    });
    await expect(client.tasks.list()).rejects.toMatchObject({
      kind: 'network',
      reason: 'network',
      cause,
    });
  });

  /** An already-cancelled signal must prevent the request, regardless of whether it is default or per-call. */
  it.each(['default', 'call'] as const)(
    'honors an already cancelled %s signal',
    async (source) => {
      const controller = new AbortController();
      const cause = new Error('cancelled by caller');
      controller.abort(cause);
      const remote = service();
      const client = sdk.createNoticeboardClient({
        baseUrl: 'https://example.test',
        fetch: remote.fetch,
        ...(source === 'default' ? { signal: controller.signal } : {}),
      });
      await expect(
        client.tasks.list(
          source === 'call' ? { signal: controller.signal } : {},
        ),
      ).rejects.toMatchObject({ kind: 'network', reason: 'aborted', cause });
      expect(remote.requests).toHaveLength(0);
    },
  );

  /** Neither signal may override the other once an HTTP request is pending. */
  it.each(['default', 'call'] as const)(
    'cancels pending HTTP via the %s signal',
    async (source) => {
      const defaultController = new AbortController();
      const callController = new AbortController();
      let markStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const fetch: typeof globalThis.fetch = async (_input, init) => {
        markStarted();
        return new Promise((_resolve, reject) =>
          init!.signal!.addEventListener(
            'abort',
            () => reject(new DOMException('cancelled', 'AbortError')),
            { once: true },
          ),
        );
      };
      const client = sdk.createNoticeboardClient({
        baseUrl: 'https://example.test',
        fetch,
        signal: defaultController.signal,
      });
      const result = client.tasks.list({ signal: callController.signal });
      const assertion = expect(result).rejects.toMatchObject({
        kind: 'network',
        reason: 'aborted',
      });
      await started;
      (source === 'default' ? defaultController : callController).abort();
      await assertion;
    },
  );
});
