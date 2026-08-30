/** Implements the browser's versioned REST client and stable error decoding. */
import type {
  ActTaskRequest,
  ActorResource,
  CreateTaskRequest,
  TaskResource,
} from './api-types.js';

interface ApiErrorEnvelope {
  error?: {
    code?: unknown;
    message?: unknown;
  };
}

export class ApiError extends Error {
  /** Creates a typed transport failure for toast, form, and conflict handling. */
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ApiClient {
  /** Receives a versioned base path and injectable Fetch implementation. */
  constructor(
    private readonly basePath = '/api/v1',
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /** Lists selectable demo identities. */
  listDemoUsers(): Promise<ActorResource[]> {
    return this.request('/demo/users');
  }

  /** Loads all tasks once for browser-memory filtering. */
  listTasks(): Promise<TaskResource[]> {
    return this.request('/tasks');
  }

  /** Loads one fresh task projection after commands or conflicts. */
  getTask(taskId: string): Promise<TaskResource> {
    return this.request(`/tasks/${encodeURIComponent(taskId)}`);
  }

  /** Creates one task with the selected demo identity. */
  createTask(actorId: string, body: CreateTaskRequest): Promise<TaskResource> {
    return this.command('/tasks', actorId, body);
  }

  /** Applies one optimistic task action with the selected demo identity. */
  actOnTask(
    actorId: string,
    taskId: string,
    body: ActTaskRequest,
  ): Promise<TaskResource> {
    return this.command(
      `/tasks/${encodeURIComponent(taskId)}/actions`,
      actorId,
      body,
    );
  }

  /** Restores deterministic server demo tasks. */
  resetDemo(actorId: string): Promise<{ reset: true }> {
    return this.command('/demo/reset', actorId);
  }

  /** Sends one JSON demo command with the required identity header. */
  private command<T>(
    path: string,
    actorId: string,
    body?: unknown,
  ): Promise<T> {
    return this.request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-demo-user-id': actorId,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  /** Parses successful JSON or converts the stable server error envelope to ApiError. */
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const fetcher = this.fetcher;
    const response = await fetcher(`${this.basePath}${path}`, init);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const envelope = payload as ApiErrorEnvelope | null;
      const code =
        typeof envelope?.error?.code === 'string'
          ? envelope.error.code
          : 'HTTP_ERROR';
      const message =
        typeof envelope?.error?.message === 'string'
          ? envelope.error.message
          : '请求失败，请稍后重试';
      throw new ApiError(response.status, code, message);
    }
    return payload as T;
  }
}
