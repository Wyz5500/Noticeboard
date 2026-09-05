/** Verifies tracked transport schema types and HTTP behavior independently of its generator helpers. */
import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import * as transport from '../../apps/cli/src/sdk/internal/generated/transport.js';
import type {
  TaskResponseDto,
  TaskActivityResponseDto,
  TaskCommentResponseDto,
  CreateTaskDto,
} from '../../apps/cli/src/sdk/internal/generated/transport.js';

const requestBody: CreateTaskDto = {
  title: '客户端测试',
  description: '合同',
  type: 'exploration',
  dueDate: '2026-09-02',
  reward: '测试奖励',
};
const task: TaskResponseDto = {
  id: 'task-1',
  title: '客户端测试',
  description: '合同',
  type: 'exploration',
  dueDate: '2026-09-02',
  assignee: null,
  publisher: {
    id: 'user-1',
    name: '演示',
    username: 'demo',
    role: 'member',
    roleLabel: '成员',
    permissions: [],
  },
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  status: 'not_started',
  workflowStatus: 'not_started',
  version: 1,
  timeline: [],
  reward: '测试奖励',
  statusLabel: '未开始',
  workflowStatusLabel: '未开始',
  typeLabel: '探索',
};

/** Captures real generated wire arguments while binding a caller-scoped origin and fake network. */
function scopedFetch(baseUrl: string, response: () => Response) {
  const requests: Request[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(
      new URL(input instanceof Request ? input.url : input, baseUrl),
      init,
    );
    requests.push(request);
    request.signal.throwIfAborted();
    return response();
  };
  return { fetcher, requests };
}

describe('generated transport schema contract', () => {
  /** Rejects widened enums, lost nullability, Date conversion and broken timeline discrimination at compile time. */
  it('preserves schema types under the repository TypeScript compiler', () => {
    expectTypeOf<
      TaskResponseDto['assignee']
    >().toEqualTypeOf<transport.ActorResponseDto | null>();
    expectTypeOf<TaskResponseDto['dueDate']>().toEqualTypeOf<string>();
    expectTypeOf<TaskResponseDto['createdAt']>().toEqualTypeOf<string>();
    expectTypeOf<TaskResponseDto['status']>().toEqualTypeOf<
      | 'not_started'
      | 'in_progress'
      | 'completed'
      | 'reopened'
      | 'closed'
      | 'expired'
    >();
    expectTypeOf<TaskResponseDto['timeline'][number]>().toEqualTypeOf<
      TaskActivityResponseDto | TaskCommentResponseDto
    >();
    expectTypeOf<TaskCommentResponseDto['content']>().toEqualTypeOf<
      string | null
    >();
    expectTypeOf<TaskResponseDto>().not.toBeAny();
    const event = {
      kind: 'comment',
      content: null,
    } as TaskResponseDto['timeline'][number];
    if (event.kind === 'comment') {
      expectTypeOf(event).toEqualTypeOf<TaskCommentResponseDto>();
      // @ts-expect-error Comments do not carry lifecycle action fields.
      void event.action;
    } else {
      expectTypeOf(event).toEqualTypeOf<TaskActivityResponseDto>();
      // @ts-expect-error Activities do not carry comment bodies.
      void event.content;
    }
    // @ts-expect-error The v1 closed enum rejects unknown status values.
    const invalidStatus: TaskResponseDto['status'] = 'new-status';
    // @ts-expect-error Wire dates remain strings rather than Date objects.
    const invalidDate: TaskResponseDto['dueDate'] = new Date();
    expect(invalidStatus).toBe('new-status');
    expect(invalidDate).toBeInstanceOf(Date);
  });

  /** Every artifact operation must remain callable, including operations outside the first CLI release. */
  it('exports callable operations for every tracked operationId', () => {
    const artifact = JSON.parse(
      readFileSync('openapi/v1/noticeboard.openapi.json', 'utf8'),
    ) as { paths: Record<string, Record<string, { operationId: string }>> };
    const ids = Object.values(artifact.paths).flatMap((path) =>
      Object.values(path).map((operation) => operation.operationId),
    );
    expect(ids).toHaveLength(19);
    for (const id of ids)
      expect(Reflect.get(transport, id), id).toBeTypeOf('function');
  });
});

const jsonOperations: Array<{
  name: string;
  method: string;
  path: string;
  call: (options: RequestInit, fetcher: typeof fetch) => Promise<unknown>;
}> = [
  {
    name: 'createAdminRole',
    method: 'POST',
    path: '/api/v1/admin/roles',
    call: (o, f) => transport.createAdminRole({ name: '角色' }, o, f),
  },
  {
    name: 'updateAdminRole',
    method: 'PATCH',
    path: '/api/v1/admin/roles/role-1',
    call: (o, f) =>
      transport.updateAdminRole(
        'role-1',
        { name: '角色', permissions: [] },
        o,
        f,
      ),
  },
  {
    name: 'createAdminUser',
    method: 'POST',
    path: '/api/v1/admin/users',
    call: (o, f) =>
      transport.createAdminUser({ name: '成员', roleId: 'role-1' }, o, f),
  },
  {
    name: 'updateAdminUser',
    method: 'PATCH',
    path: '/api/v1/admin/users/user-1',
    call: (o, f) =>
      transport.updateAdminUser(
        'user-1',
        { name: '成员', roleId: 'role-1' },
        o,
        f,
      ),
  },
  {
    name: 'createTask',
    method: 'POST',
    path: '/api/v1/tasks',
    call: (o, f) => transport.createTask(requestBody, o, f),
  },
  {
    name: 'actOnTask',
    method: 'POST',
    path: '/api/v1/tasks/task-1/actions',
    call: (o, f) =>
      transport.actOnTask(
        'task-1',
        { action: 'accept', expectedVersion: 1 },
        o,
        f,
      ),
  },
  {
    name: 'createTaskComment',
    method: 'POST',
    path: '/api/v1/tasks/task-1/comments',
    call: (o, f) =>
      transport.createTaskComment(
        'task-1',
        { content: '评论', expectedVersion: 1 },
        o,
        f,
      ),
  },
  {
    name: 'editTaskComment',
    method: 'PATCH',
    path: '/api/v1/tasks/task-1/comments/comment-1',
    call: (o, f) =>
      transport.editTaskComment(
        'task-1',
        'comment-1',
        { content: '评论', expectedVersion: 1 },
        o,
        f,
      ),
  },
  {
    name: 'deleteTaskComment',
    method: 'DELETE',
    path: '/api/v1/tasks/task-1/comments/comment-1',
    call: (o, f) =>
      transport.deleteTaskComment(
        'task-1',
        'comment-1',
        { expectedVersion: 1 },
        o,
        f,
      ),
  },
  {
    name: 'renewExpiredTask',
    method: 'POST',
    path: '/api/v1/tasks/task-1/expiration-renewal',
    call: (o, f) =>
      transport.renewExpiredTask(
        'task-1',
        {
          dueDate: '2026-09-12',
          expectedVersion: 1,
          recoveryStrategy: 'reopened',
        },
        o,
        f,
      ),
  },
];

describe('generated Fetch wire contract', () => {
  /** Every JSON-writing operation must emit one media type and keep caller headers untouched. */
  it.each(jsonOperations)(
    'merges JSON headers for $name',
    async ({ method, path, call }) => {
      const captured = new Error('request captured before network IO');
      const network = scopedFetch('https://example.test', () => {
        throw captured;
      });
      const headers = new Headers({
        'Content-Type': 'application/json',
        'X-Demo-User-Id': 'one',
      });
      await expect(call({ headers }, network.fetcher)).rejects.toBe(captured);
      const request = network.requests[0]!;
      expect(request.url).toBe(`https://example.test${path}`);
      expect(request.method).toBe(method);
      expect(request.headers.get('content-type')).toBe('application/json');
      expect(request.headers.get('X-Demo-User-Id')).toBe('one');
      expect([...headers.entries()]).toEqual([
        ['content-type', 'application/json'],
        ['x-demo-user-id', 'one'],
      ]);
    },
  );

  /** Caller headers override the generated media type case-insensitively for every HeadersInit representation. */
  it.each([
    {
      name: 'Headers',
      headers: new Headers({
        'Content-Type': 'application/json; charset=utf-8',
        'X-Demo-User-Id': 'one',
      }),
    },
    {
      name: 'lowercase record',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'X-Demo-User-Id': 'one',
      },
    },
    {
      name: 'mixed-case record',
      headers: {
        'cOnTeNt-TyPe': 'application/json; charset=utf-8',
        'X-Demo-User-Id': 'one',
      },
    },
    {
      name: 'tuple array',
      headers: [
        ['content-type', 'application/json; charset=utf-8'],
        ['X-Demo-User-Id', 'one'],
      ] as [string, string][],
    },
  ])(
    'merges Content-Type from $name without duplicate values',
    async ({ headers }) => {
      const network = scopedFetch('https://example.test', () =>
        Response.json(task, { status: 201 }),
      );
      await transport.createTask(requestBody, { headers }, network.fetcher);
      expect(network.requests[0]!.headers.get('content-type')).toBe(
        'application/json; charset=utf-8',
      );
      expect(network.requests[0]!.headers.get('X-Demo-User-Id')).toBe('one');
      expect(await network.requests[0]!.json()).toEqual(requestBody);
    },
  );

  /** Client instances must not leak hosts, headers, Fetch implementations or signals across calls. */
  it('isolates injected origins and identities and forwards AbortSignal', async () => {
    const first = scopedFetch('https://one.example', () => Response.json([]));
    const second = scopedFetch('https://two.example', () => Response.json([]));
    const controller = new AbortController();
    await Promise.all([
      transport.listTasks(
        {
          headers: new Headers({ 'X-Demo-User-Id': 'one' }),
          signal: controller.signal,
        },
        first.fetcher,
      ),
      transport.listTasks(
        { headers: { 'X-Demo-User-Id': 'two' } },
        second.fetcher,
      ),
    ]);
    expect(first.requests[0]!.url).toBe('https://one.example/api/v1/tasks');
    expect(second.requests[0]!.url).toBe('https://two.example/api/v1/tasks');
    expect(first.requests[0]!.headers.get('X-Demo-User-Id')).toBe('one');
    expect(second.requests[0]!.headers.get('X-Demo-User-Id')).toBe('two');
    controller.abort();
    expect(first.requests[0]!.signal.aborted).toBe(true);
    expect(second.requests[0]!.signal.aborted).toBe(false);
  });

  /** JSON creation must serialize the documented request and retain HTTP 201 with date strings. */
  it('preserves JSON creation requests and responses', async () => {
    const network = scopedFetch('https://example.test', () =>
      Response.json(task, { status: 201 }),
    );
    const result = await transport.createTask(
      requestBody,
      { headers: [['X-Demo-User-Id', 'one']] },
      network.fetcher,
    );
    const request = network.requests[0]!;
    expect(request.method).toBe('POST');
    expect(request.headers.get('content-type')).toBe('application/json');
    expect(request.headers.get('X-Demo-User-Id')).toBe('one');
    expect(await request.json()).toEqual(requestBody);
    expect(result.status).toBe(201);
    expect(result.data).toEqual(task);
  });

  /** DELETE comments require a JSON version body and encoded path segments. */
  it('keeps DELETE JSON bodies and ordinary HTTP 200', async () => {
    const network = scopedFetch('https://example.test', () =>
      Response.json(task),
    );
    const result = await transport.deleteTaskComment(
      'task/1',
      'comment?2',
      { expectedVersion: 7 },
      undefined,
      network.fetcher,
    );
    expect(network.requests[0]!.url).toBe(
      'https://example.test/api/v1/tasks/task%2F1/comments/comment%3F2',
    );
    expect(network.requests[0]!.method).toBe('DELETE');
    expect(await network.requests[0]!.json()).toEqual({ expectedVersion: 7 });
    expect(result.status).toBe(200);
    expect(result.data).toEqual(task);
  });

  /** A 204 response must not attempt JSON parsing or lose its HTTP status. */
  it('handles an empty HTTP 204 response', async () => {
    const network = scopedFetch(
      'https://example.test',
      () => new Response(null, { status: 204 }),
    );
    const result = await transport.deleteAdminUser(
      'user-1',
      undefined,
      network.fetcher,
    );
    expect(result.status).toBe(204);
    expect(network.requests[0]!.method).toBe('DELETE');
  });

  /** Unknown server error codes remain transparent and conflict writes are not retried. */
  it('preserves an error envelope and raw conflict status', async () => {
    const envelope = {
      error: {
        code: 'FUTURE_CONFLICT',
        message: '版本冲突',
        details: { expectedVersion: 7 },
      },
      path: '/api/v1/tasks/task-1/comments/comment-1',
      timestamp: '2026-09-01T00:00:00.000Z',
    };
    const network = scopedFetch('https://example.test', () =>
      Response.json(envelope, { status: 409 }),
    );
    const result = await transport.deleteTaskComment(
      'task-1',
      'comment-1',
      { expectedVersion: 7 },
      undefined,
      network.fetcher,
    );
    expect(result.status).toBe(409);
    expect(result.data).toEqual(envelope);
    expect(network.requests).toHaveLength(1);
  });

  /** Network and protocol failures must reject writes rather than return success or replay them. */
  it.each(['network', 'protocol', 'abort'])(
    'rejects %s failures without retrying writes',
    async (failure) => {
      const controller = new AbortController();
      if (failure === 'abort') controller.abort();
      const network = scopedFetch('https://example.test', () => {
        if (failure === 'network') throw new TypeError('network unavailable');
        return new Response('invalid-json', { status: 201 });
      });
      await expect(
        transport.createTask(
          requestBody,
          { signal: controller.signal },
          network.fetcher,
        ),
      ).rejects.toBeInstanceOf(Error);
      expect(network.requests).toHaveLength(1);
    },
  );
});
