/** Implements the browser's versioned REST client and stable error decoding. */
import type {
  ActTaskRequest,
  ActorResource,
  AdminOverviewResource,
  AdminRoleResource,
  AdminUserResource,
  CreateAdminRoleRequest,
  CreateAdminUserRequest,
  CreateTaskCommentRequest,
  CreateTaskRequest,
  DeleteTaskCommentRequest,
  EditTaskCommentRequest,
  RenewExpiredTaskRequest,
  UpdateAdminRoleRequest,
  UpdateAdminUserRequest,
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

  /** Loads all administrator-visible users, roles, and fixed permissions. */
  getAdminOverview(actorId: string): Promise<AdminOverviewResource> {
    return this.authorizedRequest('/admin/overview', actorId);
  }

  /** Creates one administrator-managed user. */
  createAdminUser(
    actorId: string,
    body: CreateAdminUserRequest,
  ): Promise<AdminUserResource> {
    return this.command('/admin/users', actorId, body);
  }

  /** Updates one administrator-managed user. */
  updateAdminUser(
    actorId: string,
    userId: string,
    body: UpdateAdminUserRequest,
  ): Promise<AdminUserResource> {
    return this.modify(
      `/admin/users/${encodeURIComponent(userId)}`,
      actorId,
      'PATCH',
      body,
    );
  }

  /** Soft-deletes one administrator-managed user. */
  deleteAdminUser(actorId: string, userId: string): Promise<void> {
    return this.modify(
      `/admin/users/${encodeURIComponent(userId)}`,
      actorId,
      'DELETE',
    );
  }

  /** Restores one administrator-managed user. */
  restoreAdminUser(
    actorId: string,
    userId: string,
  ): Promise<AdminUserResource> {
    return this.command(
      `/admin/users/${encodeURIComponent(userId)}/restore`,
      actorId,
    );
  }

  /** Creates one administrator-managed custom role. */
  createAdminRole(
    actorId: string,
    body: CreateAdminRoleRequest,
  ): Promise<AdminRoleResource> {
    return this.command('/admin/roles', actorId, body);
  }

  /** Updates one administrator-managed role. */
  updateAdminRole(
    actorId: string,
    roleId: string,
    body: UpdateAdminRoleRequest,
  ): Promise<AdminRoleResource> {
    return this.modify(
      `/admin/roles/${encodeURIComponent(roleId)}`,
      actorId,
      'PATCH',
      body,
    );
  }

  /** Soft-deletes one administrator-managed custom role. */
  deleteAdminRole(actorId: string, roleId: string): Promise<void> {
    return this.modify(
      `/admin/roles/${encodeURIComponent(roleId)}`,
      actorId,
      'DELETE',
    );
  }

  /** Restores one administrator-managed role. */
  restoreAdminRole(
    actorId: string,
    roleId: string,
  ): Promise<AdminRoleResource> {
    return this.command(
      `/admin/roles/${encodeURIComponent(roleId)}/restore`,
      actorId,
    );
  }

  /** Loads all tasks once for browser-memory filtering. */
  listTasks(actorId: string): Promise<TaskResource[]> {
    return this.authorizedRequest('/tasks', actorId);
  }

  /** Loads one fresh task projection after commands or conflicts. */
  getTask(taskId: string, actorId: string): Promise<TaskResource> {
    return this.authorizedRequest(
      `/tasks/${encodeURIComponent(taskId)}`,
      actorId,
    );
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

  /** Adds one optimistic comment to a task timeline. */
  createTaskComment(
    actorId: string,
    taskId: string,
    body: CreateTaskCommentRequest,
  ): Promise<TaskResource> {
    return this.command(
      `/tasks/${encodeURIComponent(taskId)}/comments`,
      actorId,
      body,
    );
  }

  /** Replaces one optimistic task comment while preserving its event history. */
  editTaskComment(
    actorId: string,
    taskId: string,
    commentId: string,
    body: EditTaskCommentRequest,
  ): Promise<TaskResource> {
    return this.modify(
      `/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`,
      actorId,
      'PATCH',
      body,
    );
  }

  /** Soft-deletes one optimistic task comment. */
  deleteTaskComment(
    actorId: string,
    taskId: string,
    commentId: string,
    body: DeleteTaskCommentRequest,
  ): Promise<TaskResource> {
    return this.modify(
      `/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`,
      actorId,
      'DELETE',
      body,
    );
  }

  /** Renews one expired task with a new deadline and recovery strategy. */
  renewExpiredTask(
    actorId: string,
    taskId: string,
    body: RenewExpiredTaskRequest,
  ): Promise<TaskResource> {
    return this.command(
      `/tasks/${encodeURIComponent(taskId)}/expiration-renewal`,
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
    const headers: Record<string, string> = {
      'x-demo-user-id': actorId,
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    return this.request(path, {
      method: 'POST',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  /** Sends an identity-authorized JSON read request. */
  private authorizedRequest<T>(path: string, actorId: string): Promise<T> {
    return this.request(path, { headers: { 'x-demo-user-id': actorId } });
  }

  /** Sends one identity-authorized mutation with the requested HTTP method. */
  private modify<T>(
    path: string,
    actorId: string,
    method: 'PATCH' | 'DELETE',
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = { 'x-demo-user-id': actorId };
    if (body !== undefined) headers['content-type'] = 'application/json';
    return this.request(path, {
      method,
      headers,
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
