/** Exercises write façades through their real transport, including wire and replay boundaries. */
import { expect, expectTypeOf, it } from 'vitest';
import {
  createNoticeboardClient,
  type NoticeboardClient,
  type CreateTaskInput,
  type ActTaskInput,
  type RenewTaskInput,
  type CreateCommentInput,
  type EditCommentInput,
  type DeleteCommentInput,
} from '../../apps/cli/src/sdk/index.js';
import type {
  CreateTaskDto,
  ActTaskDto,
  RenewExpiredTaskDto,
  AddTaskCommentDto,
  EditTaskCommentDto,
  DeleteTaskCommentDto,
} from '../../apps/cli/src/sdk/internal/generated/transport.js';
import { task, apiError } from './fixtures.js';

const creation = {
  title: '新任务',
  type: 'exploration',
  description: '第一行\n第二行',
  reward: '奖励',
  dueDate: '2026-09-10',
} as const;
const cases: {
  name: string;
  method: string;
  path: string;
  status: number;
  body: unknown;
  invoke: (client: NoticeboardClient) => Promise<unknown>;
}[] = [
  {
    name: 'create',
    method: 'POST',
    path: '/tasks',
    status: 201,
    body: creation,
    invoke: (c) => c.tasks.create(creation),
  },
  {
    name: 'act',
    method: 'POST',
    path: '/tasks/a%2Fb/actions',
    status: 200,
    body: { action: 'accept', expectedVersion: 4 },
    invoke: (c) => c.tasks.act('a/b', { action: 'accept', expectedVersion: 4 }),
  },
  {
    name: 'renew',
    method: 'POST',
    path: '/tasks/a%2Fb/expiration-renewal',
    status: 200,
    body: {
      dueDate: '2026-09-10',
      recoveryStrategy: 'preserve_status',
      expectedVersion: 4,
    },
    invoke: (c) =>
      c.tasks.renew('a/b', {
        dueDate: '2026-09-10',
        recoveryStrategy: 'preserve_status',
        expectedVersion: 4,
      }),
  },
  {
    name: 'comment create',
    method: 'POST',
    path: '/tasks/a%2Fb/comments',
    status: 200,
    body: { content: '正文\n第二行', expectedVersion: 4 },
    invoke: (c) =>
      c.comments.create('a/b', { content: '正文\n第二行', expectedVersion: 4 }),
  },
  {
    name: 'comment edit',
    method: 'PATCH',
    path: '/tasks/a%2Fb/comments/c%2Fd',
    status: 200,
    body: { content: '新正文', expectedVersion: 4 },
    invoke: (c) =>
      c.comments.edit('a/b', 'c/d', { content: '新正文', expectedVersion: 4 }),
  },
  {
    name: 'comment delete',
    method: 'DELETE',
    path: '/tasks/a%2Fb/comments/c%2Fd',
    status: 200,
    body: { expectedVersion: 4 },
    invoke: (c) => c.comments.delete('a/b', 'c/d', { expectedVersion: 4 }),
  },
];

/** Catches drift of handwritten inputs without exporting generated declarations. */
it('matches the governed request schemas', () => {
  expectTypeOf<CreateTaskInput>().toEqualTypeOf<CreateTaskDto>();
  expectTypeOf<ActTaskInput>().toEqualTypeOf<ActTaskDto>();
  expectTypeOf<RenewTaskInput>().toEqualTypeOf<RenewExpiredTaskDto>();
  expectTypeOf<CreateCommentInput>().toEqualTypeOf<AddTaskCommentDto>();
  expectTypeOf<EditCommentInput>().toEqualTypeOf<EditTaskCommentDto>();
  expectTypeOf<DeleteCommentInput>().toEqualTypeOf<DeleteTaskCommentDto>();
});

/** Detects wrong methods, path encoding, dropped bodies and duplicate identity/media headers. */
it.each(cases)(
  'sends $name once and decodes the returned task',
  async ({ invoke, method, path, status, body }) => {
    const requests: Request[] = [];
    const headers = new Headers({
      'x-demo-user-id': 'user-1',
      'content-type': 'application/json',
    });
    const client = createNoticeboardClient({
      baseUrl: 'https://example.test/proxy',
      getHeaders: () => headers,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(task, { status });
      },
    });
    expect(await invoke(client)).toEqual(task);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(`https://example.test/proxy/api/v1${path}`);
    expect(requests[0]!.method).toBe(method);
    expect(await requests[0]!.json()).toEqual(body);
    expect([...requests[0]!.headers]).toEqual([...headers]);
  },
);

/** Prevents any operation from replaying conflicts, malformed responses or uncertain writes. */
it.each(cases)(
  'preserves failures for $name without retry',
  async ({ invoke, status }) => {
    for (const failure of ['api', 'network', 'protocol', 'status'] as const) {
      let calls = 0;
      const client = createNoticeboardClient({
        baseUrl: 'https://example.test',
        fetch: async () => {
          calls++;
          if (failure === 'network') throw new TypeError('connection lost');
          if (failure === 'api')
            return Response.json(apiError, { status: 409 });
          return Response.json(failure === 'protocol' ? {} : task, {
            status:
              failure === 'status' ? (status === 201 ? 200 : 201) : status,
          });
        },
      });
      await expect(invoke(client)).rejects.toMatchObject({
        kind: failure === 'status' ? 'protocol' : failure,
      });
      expect(calls).toBe(1);
    }
  },
);

/** Cancellation must prevent writes before authentication or transport runs. */
it('honors per-call write cancellation', async () => {
  let calls = 0;
  const client = createNoticeboardClient({
    baseUrl: 'https://example.test',
    fetch: async () => {
      calls++;
      return Response.json(task);
    },
  });
  await expect(
    client.tasks.create(creation, { signal: AbortSignal.abort() }),
  ).rejects.toMatchObject({ kind: 'network', reason: 'aborted' });
  expect(calls).toBe(0);
});
