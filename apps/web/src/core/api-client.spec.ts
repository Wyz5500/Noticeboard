/** Verifies browser API request shapes, demo identity headers, and stable server errors. */
import { describe, expect, it } from 'vitest';

import { ApiClient } from './api-client.js';
import type { ApiError } from './api-client.js';

/** Produces a JSON Fetch response with the requested status. */
function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ApiClient', () => {
  /** Proves management overview requests carry the selected demo identity header. */
  it('loads the admin overview with the current identity', async () => {
    let request: RequestInit | undefined;
    const client = new ApiClient('/api/v1', (_input, init) => {
      request = init;
      return Promise.resolve(
        jsonResponse({ users: [], roles: [], permissions: [] }),
      );
    });

    await client.getAdminOverview('guild-admin');

    expect(request).toMatchObject({
      headers: { 'x-demo-user-id': 'guild-admin' },
    });
  });
  /** Proves protected task list reads carry the selected demo identity header. */
  it('loads all tasks with the current identity', async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const client = new ApiClient('/api/v1', (input, init) => {
      requests.push({ input, ...(init ? { init } : {}) });
      return Promise.resolve(jsonResponse([]));
    });

    await expect(client.listTasks('guild-master')).resolves.toEqual([]);
    expect(requests).toEqual([
      {
        input: '/api/v1/tasks',
        init: { headers: { 'x-demo-user-id': 'guild-master' } },
      },
    ]);
  });

  /** Proves native-style Fetch implementations are invoked without an ApiClient receiver. */
  it('does not bind the client instance as the Fetch receiver', async () => {
    const fetcher = function (this: unknown): Promise<Response> {
      expect(this).toBeUndefined();
      return Promise.resolve(jsonResponse([]));
    } as typeof fetch;

    await expect(
      new ApiClient('/api/v1', fetcher).listTasks('guild-master'),
    ).resolves.toEqual([]);
  });

  /** Proves protected task detail reads carry the selected demo identity header. */
  it('loads one task with the current identity', async () => {
    let request: RequestInit | undefined;
    const client = new ApiClient('/api/v1', (_input, init) => {
      request = init;
      return Promise.resolve(jsonResponse({ id: 'task-1' }));
    });

    await expect(client.getTask('task-1', 'guild-master')).resolves.toEqual({
      id: 'task-1',
    });
    expect(request).toEqual({
      headers: { 'x-demo-user-id': 'guild-master' },
    });
  });

  /** Proves creation sends only the frozen body contract and selected demo identity. */
  it('creates a task with X-Demo-User-Id', async () => {
    let request: RequestInit | undefined;
    const client = new ApiClient('/api/v1', (_input, init) => {
      request = init;
      return Promise.resolve(jsonResponse({ id: 'task-created' }, 201));
    });
    const body = {
      title: '新任务',
      type: 'exploration' as const,
      description: '任务描述',
      reward: '20 金币',
      dueDate: '2026-09-10',
    };

    await client.createTask('adventurer-a', body);

    expect(request).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-demo-user-id': 'adventurer-a',
      },
      body: JSON.stringify(body),
    });
  });

  /** Proves bodyless demo reset requests do not advertise an empty JSON body. */
  it('resets demo data without an empty JSON request body', async () => {
    let request: RequestInit | undefined;
    const client = new ApiClient('/api/v1', (_input, init) => {
      request = init;
      return Promise.resolve(jsonResponse({ reset: true }));
    });

    await client.resetDemo('guild-master');

    expect(request).toEqual({
      method: 'POST',
      headers: {
        'x-demo-user-id': 'guild-master',
      },
    });
  });

  /** Proves conflict envelopes become typed errors that UI code can resynchronize after. */
  it('turns a server conflict envelope into ApiError', async () => {
    const client = new ApiClient('/api/v1', () =>
      Promise.resolve(
        jsonResponse(
          { error: { code: 'CONFLICT', message: '任务已被其他操作更新' } },
          409,
        ),
      ),
    );

    await expect(
      client.actOnTask('guild-master', 'task-1', {
        action: 'approve',
        expectedVersion: 3,
      }),
    ).rejects.toEqual(
      expect.objectContaining<ApiError>({
        name: 'ApiError',
        status: 409,
        code: 'CONFLICT',
        message: '任务已被其他操作更新',
      }),
    );
  });

  /** Proves malformed non-JSON failures still produce a useful generic error. */
  it('handles an unreadable server error response', async () => {
    const client = new ApiClient('/api/v1', () =>
      Promise.resolve(new Response('gateway failure', { status: 502 })),
    );

    await expect(client.resetDemo('guild-master')).rejects.toMatchObject({
      status: 502,
      code: 'HTTP_ERROR',
      message: '请求失败，请稍后重试',
    });
  });
});
