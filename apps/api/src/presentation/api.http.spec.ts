/** Verifies the public Fastify HTTP contract independently from PostgreSQL adapters. */
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppError } from '../common/application/app-error.js';
import { AUTHORIZATION } from '../authorization/public/authorization.port.js';
import { ALL_PERMISSION_CODES } from '../authorization/public/permission.js';
import { AdminController } from '../authorization/presentation/admin.controller.js';
import {
  CreateAdminRole,
  CreateAdminUser,
  DeleteAdminRole,
  DeleteAdminUser,
  GetAdminOverview,
  RestoreAdminRole,
  RestoreAdminUser,
  UpdateAdminRole,
  UpdateAdminUser,
} from '../authorization/application/use-cases/admin-use-cases.js';
import { PermissionGuard } from '../authorization/presentation/permission.guard.js';
import { configureHttpApplication } from '../common/presentation/configure-http-application.js';
import { HealthController } from '../health/presentation/health.controller.js';
import { HealthService } from '../health/application/health.service.js';
import {
  IDENTITY_DIRECTORY,
  type IdentityDirectoryPort,
} from '../identity/public/identity-directory.port.js';
import { ListDemoActors } from '../identity/application/use-cases/list-demo-actors.js';
import { DemoController } from '../identity/presentation/demo.controller.js';
import { DemoUserGuard } from '../identity/presentation/demo-user.guard.js';
import { ActOnTask } from '../tasks/application/use-cases/act-on-task.js';
import { AddTaskComment } from '../tasks/application/use-cases/add-task-comment.js';
import { CreateTask } from '../tasks/application/use-cases/create-task.js';
import { DeleteTaskComment } from '../tasks/application/use-cases/delete-task-comment.js';
import { EditTaskComment } from '../tasks/application/use-cases/edit-task-comment.js';
import { GetTask } from '../tasks/application/use-cases/get-task.js';
import { ListTasks } from '../tasks/application/use-cases/list-tasks.js';
import { RenewExpiredTask } from '../tasks/application/use-cases/renew-expired-task.js';
import { ResetDemoTasks } from '../tasks/application/use-cases/reset-demo-tasks.js';
import type { TaskViewModel } from '../tasks/application/read-models/task-read-model.js';
import { DomainError } from '../tasks/domain/domain-error.js';
import { DemoTasksController } from '../tasks/presentation/demo-tasks.controller.js';
import { TasksController } from '../tasks/presentation/tasks.controller.js';

type OpenApiHttpMethod =
  'get' | 'put' | 'post' | 'delete' | 'patch' | 'options' | 'head' | 'trace';

interface OpenApiOperation {
  operationId?: string;
  parameters?: Array<{ in?: string; name?: string }>;
  responses: Record<string, unknown>;
}

type OpenApiPath = Partial<Record<OpenApiHttpMethod, OpenApiOperation>>;

const OPENAPI_HTTP_METHODS: readonly OpenApiHttpMethod[] = [
  'get',
  'put',
  'post',
  'delete',
  'patch',
  'options',
  'head',
  'trace',
];

const TASK: TaskViewModel = {
  id: 'task-http',
  title: 'HTTP 契约任务',
  type: 'exploration',
  description: '响应不得泄漏 ORM 实体',
  reward: '15 金币',
  dueDate: '2026-09-08',
  publisher: {
    id: 'noticeboard-master',
    username: 'noticeboard-master',
    name: '用户 A',
    role: 'user',
  },
  assignee: null,
  workflowStatus: 'not_started',
  status: 'not_started',
  createdAt: '2026-08-30T09:00:00.000Z',
  updatedAt: '2026-08-30T09:00:00.000Z',
  version: 1,
  timeline: [
    {
      kind: 'activity',
      sequence: 1,
      action: 'created',
      actor: {
        id: 'noticeboard-master',
        username: 'noticeboard-master',
        name: '用户 A',
        role: 'user',
      },
      at: '2026-08-30T09:00:00.000Z',
      detail: '任务发布至冒险家工会',
    },
  ],
};

const COMMENT_TASK: TaskViewModel = {
  ...TASK,
  id: 'task-comment',
  version: 3,
  timeline: [
    ...TASK.timeline,
    {
      kind: 'comment',
      sequence: 2,
      commentId: 'comment-http',
      actor: {
        id: 'adventurer-a',
        username: 'adventurer-a',
        name: '用户 B',
        role: 'user',
      },
      at: '2026-08-30T10:00:00.000Z',
      content: null,
      edited: false,
      deleted: true,
      deletedAt: '2026-08-30T11:00:00.000Z',
      deletedByUsername: 'noticeboard-master',
    },
  ],
};

const EDITED_TASK: TaskViewModel = {
  ...COMMENT_TASK,
  version: 4,
  timeline: [
    ...TASK.timeline,
    {
      kind: 'comment',
      sequence: 2,
      commentId: 'comment-http',
      actor: {
        id: 'noticeboard-master',
        username: 'noticeboard-master',
        name: '用户 A',
        role: 'user',
      },
      at: '2026-08-30T10:00:00.000Z',
      content: '编辑后的进度',
      edited: true,
      deleted: false,
      deletedAt: null,
      deletedByUsername: null,
    },
  ],
};

const IDENTITIES: IdentityDirectoryPort = {
  /** Lists the two actors needed by HTTP boundary examples. */
  list: () =>
    Promise.resolve([
      TASK.publisher,
      {
        id: 'adventurer-a',
        username: 'adventurer-a',
        name: '用户 B',
        role: 'user',
      },
    ]),
  /** Resolves only recognized demo identity header values. */
  findById: (id) =>
    Promise.resolve(id === TASK.publisher.id ? TASK.publisher : null),
};

let databaseReady = true;

describe('HTTP API contract', () => {
  let app: NestFastifyApplication;
  const unexpectedErrors: unknown[][] = [];

  /** Boots the real controllers, guards, validation, error filter, and OpenAPI integration. */
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        TasksController,
        DemoController,
        DemoTasksController,
        HealthController,
        AdminController,
      ],
      providers: [
        DemoUserGuard,
        PermissionGuard,
        { provide: IDENTITY_DIRECTORY, useValue: IDENTITIES },
        {
          provide: AUTHORIZATION,
          useValue: {
            hasPermission: (actorId: string) =>
              Promise.resolve(actorId === TASK.publisher.id),
          },
        },
        { provide: GetAdminOverview, useValue: { execute: () => undefined } },
        { provide: CreateAdminUser, useValue: { execute: () => undefined } },
        { provide: UpdateAdminUser, useValue: { execute: () => undefined } },
        { provide: DeleteAdminUser, useValue: { execute: () => undefined } },
        { provide: RestoreAdminUser, useValue: { execute: () => undefined } },
        { provide: CreateAdminRole, useValue: { execute: () => undefined } },
        { provide: UpdateAdminRole, useValue: { execute: () => undefined } },
        { provide: DeleteAdminRole, useValue: { execute: () => undefined } },
        { provide: RestoreAdminRole, useValue: { execute: () => undefined } },
        { provide: ListDemoActors, useValue: new ListDemoActors(IDENTITIES) },
        {
          provide: ListTasks,
          useValue: { execute: () => Promise.resolve([TASK]) },
        },
        {
          provide: GetTask,
          useValue: {
            execute: (id: string) =>
              id === TASK.id
                ? Promise.resolve(TASK)
                : id === COMMENT_TASK.id
                  ? Promise.resolve(COMMENT_TASK)
                  : Promise.reject(
                      new AppError('TASK_NOT_FOUND', '任务不存在'),
                    ),
          },
        },
        {
          provide: CreateTask,
          useValue: {
            execute: () => Promise.resolve(TASK),
          },
        },
        {
          provide: ActOnTask,
          useValue: {
            execute: (_actorId: string, id: string) => {
              if (id === 'task-conflict')
                return Promise.reject(
                  new AppError('CONFLICT', '任务已被其他操作更新'),
                );
              if (id === 'task-forbidden') {
                return Promise.reject(
                  new DomainError(
                    'ACTION_FORBIDDEN',
                    '当前身份或任务状态无法执行此操作',
                  ),
                );
              }
              if (id === 'task-expired-action') {
                return Promise.reject(
                  new DomainError('TASK_EXPIRED', '任务已失效'),
                );
              }
              if (id === 'task-internal') {
                return Promise.reject(new Error('database password leaked'));
              }
              return Promise.resolve();
            },
          },
        },
        {
          provide: AddTaskComment,
          useValue: {
            execute: (_actorId: string, id: string, content: string) => {
              if (!content.trim()) {
                return Promise.reject(
                  new DomainError(
                    'INVALID_COMMENT',
                    '评论内容必须为 1 至 1000 个字符',
                  ),
                );
              }
              if (id === 'task-conflict') {
                return Promise.reject(
                  new AppError('CONFLICT', '任务已被其他操作更新'),
                );
              }
              return Promise.resolve({ ...COMMENT_TASK, id });
            },
          },
        },
        {
          provide: DeleteTaskComment,
          useValue: {
            execute: (_actorId: string, id: string, commentId: string) => {
              if (commentId === 'missing') {
                return Promise.reject(
                  new DomainError('COMMENT_NOT_FOUND', '评论不存在'),
                );
              }
              if (commentId === 'forbidden') {
                return Promise.reject(
                  new DomainError('COMMENT_FORBIDDEN', '只能删除自己的评论'),
                );
              }
              if (id === 'task-conflict') {
                return Promise.reject(
                  new DomainError('COMMENT_CONFLICT', '评论已被删除'),
                );
              }
              return Promise.resolve({ ...COMMENT_TASK, id });
            },
          },
        },
        {
          provide: EditTaskComment,
          useValue: {
            execute: (
              _actorId: string,
              id: string,
              commentId: string,
              content: string,
            ) => {
              if (!content.trim()) {
                return Promise.reject(
                  new DomainError(
                    'INVALID_COMMENT',
                    '评论内容必须为 1 至 1000 个字符',
                  ),
                );
              }
              if (id === 'task-missing') {
                return Promise.reject(
                  new AppError('TASK_NOT_FOUND', '任务不存在'),
                );
              }
              if (commentId === 'missing') {
                return Promise.reject(
                  new DomainError('COMMENT_NOT_FOUND', '评论不存在'),
                );
              }
              if (commentId === 'forbidden') {
                return Promise.reject(
                  new DomainError('COMMENT_FORBIDDEN', '只能编辑自己的评论'),
                );
              }
              if (id === 'task-conflict') {
                return Promise.reject(
                  new DomainError('COMMENT_CONFLICT', '评论内容没有变化'),
                );
              }
              return Promise.resolve({
                ...EDITED_TASK,
                id,
                timeline: EDITED_TASK.timeline.map((event) =>
                  event.kind === 'comment' ? { ...event, content } : event,
                ),
              });
            },
          },
        },
        {
          provide: RenewExpiredTask,
          useValue: {
            execute: (_actorId: string, id: string) => {
              if (id === 'task-renewal-conflict') {
                return Promise.reject(
                  new AppError('CONFLICT', '任务已被其他操作更新'),
                );
              }
              return Promise.resolve();
            },
          },
        },
        {
          provide: ResetDemoTasks,
          useValue: { execute: () => Promise.resolve() },
        },
        {
          provide: HealthService,
          useValue: {
            live: () => ({ status: 'ok' }),
            ready: () =>
              databaseReady
                ? Promise.resolve({ status: 'ready', database: 'up' })
                : Promise.reject(
                    new AppError('DATABASE_NOT_READY', '数据库尚未就绪'),
                  ),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    configureHttpApplication(app, {
      error: (...values: unknown[]) => unexpectedErrors.push(values),
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  /** Closes Fastify handles after all request injection checks. */
  afterAll(async () => {
    await app.close();
  });

  /** Proves read endpoints expose stable codes alongside current Chinese labels. */
  it('returns task codes and Chinese labels without ORM fields', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tasks',
      headers: { 'x-demo-user-id': 'noticeboard-master' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: TASK.id,
        type: 'exploration',
        typeLabel: '探索',
        status: 'not_started',
        statusLabel: '未开始',
        publisher: expect.objectContaining({
          role: 'user',
          roleLabel: '演示用户',
        }),
        timeline: [
          expect.objectContaining({
            action: 'created',
            actionLabel: '创建任务',
          }),
        ],
      }),
    ]);
    expect(response.body).not.toContain('publisherId');
    expect(response.body).not.toContain('__entity');
  });

  /** Proves permission-protected routes authenticate unknown identities before authorizing them. */
  it('returns 401 before permission checks reject an unknown identity', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tasks',
      headers: { 'x-demo-user-id': 'unknown' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: 'UNKNOWN_IDENTITY' },
    });
  });

  /** Proves the demo identity list is public and includes stable role labels. */
  it('lists demo users without requiring an identity header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/demo/users',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: 'noticeboard-master',
        username: 'noticeboard-master',
        name: '用户 A',
        role: 'user',
        roleLabel: '演示用户',
      },
      {
        id: 'adventurer-a',
        username: 'adventurer-a',
        name: '用户 B',
        role: 'user',
        roleLabel: '演示用户',
      },
    ]);
  });

  /** Proves demo commands reject both absent and unknown actor headers as unauthorized. */
  it.each([undefined, 'unknown'])(
    'requires a known X-Demo-User-Id for task creation',
    async (actorId) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks',
        ...(actorId ? { headers: { 'x-demo-user-id': actorId } } : {}),
        payload: {
          title: '新任务',
          type: 'exploration',
          description: '有效描述',
          reward: '10 金币',
          dueDate: '2026-09-10',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: { code: 'UNKNOWN_IDENTITY' },
      });
    },
  );

  /** Proves DTO validation rejects malformed enums, dates, and missing text with status 400. */
  it('validates creation DTOs before invoking the use case', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: { 'x-demo-user-id': 'noticeboard-master' },
      payload: {
        title: '',
        type: 'wrong',
        description: '',
        reward: '',
        dueDate: 'tomorrow',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'VALIDATION_FAILED' },
    });
  });

  /** Proves valid creation uses the fixed request shape and returns a labeled task resource. */
  it('creates a task with the public request contract', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: { 'x-demo-user-id': 'noticeboard-master' },
      payload: {
        title: '新任务',
        type: 'exploration',
        description: '有效描述',
        reward: '10 金币',
        dueDate: '2026-09-10',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: TASK.id,
      statusLabel: '未开始',
    });
  });

  /** Proves public task timelines discriminate activities and deleted comment tombstones. */
  it('returns comments in place without exposing raw deletion events', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tasks/task-comment',
      headers: { 'x-demo-user-id': 'noticeboard-master' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().timeline).toEqual([
      expect.objectContaining({
        kind: 'activity',
        action: 'created',
        actor: expect.objectContaining({ username: 'noticeboard-master' }),
      }),
      expect.objectContaining({
        kind: 'comment',
        commentId: 'comment-http',
        content: null,
        deleted: true,
        deletedAt: '2026-08-30T11:00:00.000Z',
        deletedByUsername: 'noticeboard-master',
        actor: expect.objectContaining({ username: 'adventurer-a' }),
      }),
    ]);
    expect(response.body).not.toContain('comment_deleted');
    expect(response.body).not.toContain('数据库保留正文');
  });

  /** Proves comment creation uses the approved request and returns the latest complete task. */
  it('creates a task comment with status 200', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks/task-comment/comments',
      headers: { 'x-demo-user-id': 'noticeboard-master' },
      payload: { content: '进度说明', expectedVersion: 2 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'task-comment',
      version: 3,
      timeline: expect.arrayContaining([
        expect.objectContaining({ kind: 'comment', commentId: 'comment-http' }),
      ]),
    });
  });

  /** Proves comment creation responds from the committed snapshot without a second read. */
  it('returns a committed comment snapshot when detail lookup would fail', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks/task-write-response/comments',
      headers: { 'x-demo-user-id': 'noticeboard-master' },
      payload: { content: '提交后直接响应', expectedVersion: 2 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe('task-write-response');
  });

  /** Proves trimming happens before the public 1000-character limit is enforced. */
  it('accepts a 1000-character comment surrounded by whitespace', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks/task-comment/comments',
      headers: { 'x-demo-user-id': 'noticeboard-master' },
      payload: { content: `  ${'x'.repeat(1000)}  `, expectedVersion: 2 },
    });

    expect(response.statusCode).toBe(200);
  });

  /** Proves comment editing uses PATCH and returns the committed latest body. */
  it('edits a task comment with status 200', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/tasks/task-edit-response/comments/comment-http',
      headers: { 'x-demo-user-id': 'noticeboard-master' },
      payload: { content: '  编辑后的进度  ', expectedVersion: 3 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'task-edit-response',
      version: 4,
      timeline: expect.arrayContaining([
        expect.objectContaining({
          kind: 'comment',
          content: '编辑后的进度',
          edited: true,
          deleted: false,
        }),
      ]),
    });
  });

  /** Proves edit request validation rejects malformed content and optimistic versions. */
  it.each([
    [{ content: '   ', expectedVersion: 3 }],
    [{ content: '前缀\0后缀', expectedVersion: 3 }],
    [{ content: 'x'.repeat(1001), expectedVersion: 3 }],
    [{ content: '有效正文', expectedVersion: '3' }],
    [{ content: '有效正文', expectedVersion: 0 }],
  ])('validates comment edit requests', async (payload) => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/tasks/task-edit-response/comments/comment-http',
      headers: { 'x-demo-user-id': 'noticeboard-master' },
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'VALIDATION_FAILED' },
    });
  });

  /** Proves stable edit failures map to their approved HTTP statuses. */
  it.each([
    ['task-missing', 'comment-http', 404, 'TASK_NOT_FOUND'],
    ['task-comment', 'missing', 404, 'COMMENT_NOT_FOUND'],
    ['task-comment', 'forbidden', 403, 'COMMENT_FORBIDDEN'],
    ['task-conflict', 'comment-http', 409, 'COMMENT_CONFLICT'],
  ])('maps comment edit failures', async (taskId, commentId, status, code) => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${taskId}/comments/${commentId}`,
      headers: { 'x-demo-user-id': 'noticeboard-master' },
      payload: { content: '新的正文', expectedVersion: 3 },
    });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ error: { code } });
  });

  /** Proves comment deletion accepts an optimistic body and returns the latest complete task. */
  it('deletes a task comment with status 200', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/tasks/task-comment/comments/comment-http',
      headers: { 'x-demo-user-id': 'noticeboard-master' },
      payload: { expectedVersion: 2 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'task-comment',
      timeline: expect.arrayContaining([
        expect.objectContaining({
          kind: 'comment',
          deleted: true,
          content: null,
        }),
      ]),
    });
  });

  /** Proves comment deletion responds from the committed snapshot without a second read. */
  it('returns a committed deletion snapshot when detail lookup would fail', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/tasks/task-delete-response/comments/comment-http',
      headers: { 'x-demo-user-id': 'noticeboard-master' },
      payload: { expectedVersion: 2 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe('task-delete-response');
  });

  /** Proves NUL is rejected as a client validation failure before PostgreSQL. */
  it('rejects comment content containing NUL', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks/task-comment/comments',
      headers: { 'x-demo-user-id': 'noticeboard-master' },
      payload: { content: '前缀\0后缀', expectedVersion: 2 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'VALIDATION_FAILED' },
    });
  });

  /** Proves comment validation rejects blank and oversized public content. */
  it.each(['   ', 'x'.repeat(1001)])(
    'validates comment content at the HTTP and domain boundaries',
    async (content) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/tasks/task-comment/comments',
        headers: { 'x-demo-user-id': 'noticeboard-master' },
        payload: { content, expectedVersion: 2 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: expect.objectContaining({
          code: expect.stringMatching(/^(INVALID_COMMENT|VALIDATION_FAILED)$/),
        }),
      });
    },
  );

  /** Proves stable comment deletion failures map to their approved HTTP statuses. */
  it.each([
    ['task-comment', 'missing', 404, 'COMMENT_NOT_FOUND'],
    ['task-comment', 'forbidden', 403, 'COMMENT_FORBIDDEN'],
    ['task-conflict', 'comment-http', 409, 'COMMENT_CONFLICT'],
  ])(
    'maps comment deletion failures',
    async (taskId, commentId, status, code) => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/tasks/${taskId}/comments/${commentId}`,
        headers: { 'x-demo-user-id': 'noticeboard-master' },
        payload: { expectedVersion: 2 },
      });

      expect(response.statusCode).toBe(status);
      expect(response.json()).toMatchObject({ error: { code } });
    },
  );

  /** Proves clients cannot choose the server-derived account username. */
  it('rejects a client-supplied username when creating an admin user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: { 'x-demo-user-id': 'noticeboard-master' },
      payload: {
        username: 'client-choice',
        name: '新用户',
        roleId: 'role-user',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'VALIDATION_FAILED' },
    });
  });

  /** Proves expired-task renewal uses its dedicated optimistic command contract. */
  it('renews an expired task through the dedicated endpoint', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${TASK.id}/expiration-renewal`,
      headers: { 'x-demo-user-id': 'noticeboard-master' },
      payload: {
        dueDate: '2026-09-10',
        recoveryStrategy: 'preserve_status',
        expectedVersion: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: TASK.id,
      workflowStatus: 'not_started',
      status: 'not_started',
    });
  });

  /** Proves optimistic state conflicts map to status 409 with a stable code. */
  it('maps action version conflicts to 409', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks/task-conflict/actions',
      headers: { 'x-demo-user-id': 'noticeboard-master' },
      payload: { action: 'accept', expectedVersion: 1 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  /** Proves domain authorization failures retain their distinct status 403 semantics. */
  it('maps forbidden task actions to 403', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks/task-forbidden/actions',
      headers: { 'x-demo-user-id': 'noticeboard-master' },
      payload: { action: 'accept', expectedVersion: 1 },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code: 'ACTION_FORBIDDEN' },
    });
  });

  /** Proves a task crossing its due date maps ordinary actions to a conflict. */
  it('maps expired task actions to 409', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks/task-expired-action/actions',
      headers: { 'x-demo-user-id': 'noticeboard-master' },
      payload: { action: 'accept', expectedVersion: 1 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: { code: 'TASK_EXPIRED' },
    });
  });

  /** Proves unexpected failures are logged with diagnostics but return only a safe envelope. */
  it('logs unexpected failures without leaking details to HTTP clients', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks/task-internal/actions',
      headers: { 'x-demo-user-id': 'noticeboard-master' },
      payload: { action: 'accept', expectedVersion: 1 },
    });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('database password leaked');
    expect(response.json()).toMatchObject({
      error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
    });
    expect(unexpectedErrors.flat().join(' ')).toContain(
      'database password leaked',
    );
  });

  /** Proves missing details map to the frozen 404 semantics. */
  it('maps missing tasks to 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tasks/missing',
      headers: { 'x-demo-user-id': 'noticeboard-master' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: 'TASK_NOT_FOUND' },
    });
  });

  /** Proves liveness and readiness remain outside the versioned API prefix. */
  it('exposes liveness and database readiness endpoints', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/health/live' })).json(),
    ).toEqual({ status: 'ok' });
    expect(
      (await app.inject({ method: 'GET', url: '/health/ready' })).json(),
    ).toEqual({
      status: 'ready',
      database: 'up',
    });
  });

  /** Proves a failed PostgreSQL probe maps readiness to the frozen 503 envelope. */
  it('returns 503 while the database is not ready', async () => {
    databaseReady = false;
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    databaseReady = true;

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: 'DATABASE_NOT_READY' },
    });
  });

  /** Proves Swagger UI and the machine-readable OpenAPI contract are both exposed. */
  it('publishes docs and OpenAPI JSON with versioned paths', async () => {
    const docs = await app.inject({ method: 'GET', url: '/api/docs' });
    const schema = await app.inject({
      method: 'GET',
      url: '/api/openapi.json',
    });

    expect(docs.statusCode).toBe(200);
    expect(schema.statusCode).toBe(200);
    const document = schema.json<{
      paths: Record<string, OpenApiPath>;
      components: {
        schemas: Record<
          string,
          {
            properties?: Record<
              string,
              {
                enum?: string[];
                format?: string;
                maxLength?: number;
                minLength?: number;
                nullable?: boolean;
                type?: string;
                items?: {
                  enum?: string[];
                  oneOf?: Array<{ $ref?: string }>;
                  discriminator?: { propertyName?: string };
                };
              }
            >;
          }
        >;
      };
    }>();
    expect(document.paths).toHaveProperty('/api/v1/tasks');
    const operations = Object.entries(document.paths).flatMap(([path, item]) =>
      OPENAPI_HTTP_METHODS.flatMap((method) => {
        const operation = item[method];
        return operation ? [{ method, operation, path }] : [];
      }),
    );
    expect(
      operations.filter(
        ({ operation }) =>
          typeof operation.operationId !== 'string' ||
          !operation.operationId.trim(),
      ),
    ).toEqual([]);
    const operationIds = operations.map(
      ({ operation }) => operation.operationId!,
    );
    expect([...operationIds].sort()).toEqual(
      [
        'actOnTask',
        'createAdminRole',
        'createAdminUser',
        'createTask',
        'createTaskComment',
        'deleteAdminRole',
        'deleteAdminUser',
        'deleteTaskComment',
        'editTaskComment',
        'getAdminOverview',
        'getTask',
        'listDemoUsers',
        'listTasks',
        'renewExpiredTask',
        'resetDemoTasks',
        'restoreAdminRole',
        'restoreAdminUser',
        'updateAdminRole',
        'updateAdminUser',
      ].sort(),
    );
    expect(new Set(operationIds).size).toBe(operationIds.length);
    expect(
      operations.flatMap(({ method, operation, path }) => {
        const identityHeaders = (operation.parameters ?? []).filter(
          (parameter) =>
            parameter.in === 'header' &&
            parameter.name?.toLowerCase() === 'x-demo-user-id',
        );
        return identityHeaders.length > 1
          ? [`${method.toUpperCase()} ${path}`]
          : [];
      }),
    ).toEqual([]);
    expect(
      document.paths['/api/v1/admin/users']?.post?.responses,
    ).toHaveProperty('404');
    expect(
      document.paths['/api/v1/admin/users/{id}']?.delete?.responses,
    ).toHaveProperty('204');
    expect(
      document.paths['/api/v1/admin/roles/{id}']?.delete?.responses,
    ).toHaveProperty('204');
    expect(
      document.paths['/api/v1/admin/users/{id}/restore']?.post?.responses,
    ).toHaveProperty('200');
    expect(
      document.paths['/api/v1/admin/roles/{id}/restore']?.post?.responses,
    ).toHaveProperty('200');
    expect(document.paths['/api/v1/tasks']?.get?.responses).toHaveProperty(
      '401',
    );
    expect(document.paths['/api/v1/tasks']?.get?.responses).toHaveProperty(
      '403',
    );
    expect(document.paths).not.toHaveProperty('/health/live');
    expect(document.paths).not.toHaveProperty('/health/ready');
    expect(
      document.paths['/api/v1/demo/reset']?.post?.responses,
    ).toHaveProperty('401');
    expect(
      document.paths['/api/v1/demo/reset']?.post?.responses,
    ).toHaveProperty('403');
    expect(
      document.paths[
        '/api/v1/tasks/{taskId}/actions'
      ]?.post?.parameters?.filter(
        (parameter) =>
          parameter.in === 'header' &&
          parameter.name?.toLowerCase() === 'x-demo-user-id',
      ),
    ).toHaveLength(1);
    expect(
      document.paths['/api/v1/tasks/{taskId}/actions']?.post?.responses,
    ).toHaveProperty('409');
    expect(
      document.paths['/api/v1/tasks/{taskId}/comments']?.post?.responses,
    ).toMatchObject({
      '200': expect.any(Object),
      '403': expect.any(Object),
      '409': expect.any(Object),
    });
    expect(
      document.paths['/api/v1/tasks/{taskId}/comments/{commentId}']?.patch
        ?.responses,
    ).toMatchObject({
      '200': expect.any(Object),
      '400': expect.any(Object),
      '401': expect.any(Object),
      '403': expect.any(Object),
      '404': expect.any(Object),
      '409': expect.any(Object),
    });
    expect(
      document.paths['/api/v1/tasks/{taskId}/comments/{commentId}']?.delete
        ?.responses,
    ).toMatchObject({
      '200': expect.any(Object),
      '403': expect.any(Object),
      '404': expect.any(Object),
      '409': expect.any(Object),
    });
    expect(
      document.paths['/api/v1/tasks/{taskId}/expiration-renewal']?.post
        ?.responses,
    ).toHaveProperty('409');
    expect(document.components.schemas).not.toHaveProperty(
      'LiveHealthResponseDto',
    );
    expect(document.components.schemas).not.toHaveProperty(
      'ReadyHealthResponseDto',
    );
    expect(
      document.components.schemas.CreateTaskDto?.properties?.type?.enum,
    ).toEqual(['exploration', 'collection', 'escort', 'bounty', 'building']);
    expect(
      document.components.schemas.TaskResponseDto?.properties?.status?.enum,
    ).toEqual([
      'not_started',
      'in_progress',
      'completed',
      'reopened',
      'closed',
      'expired',
    ]);
    expect(
      document.components.schemas.AddTaskCommentDto?.properties?.content,
    ).toMatchObject({ minLength: 1, maxLength: 1000 });
    expect(
      document.components.schemas.EditTaskCommentDto?.properties?.content,
    ).toMatchObject({ minLength: 1, maxLength: 1000 });
    expect(
      document.components.schemas.TaskResponseDto?.properties?.timeline?.items,
    ).toMatchObject({
      oneOf: expect.arrayContaining([
        expect.objectContaining({
          $ref: expect.stringContaining('TaskActivityResponseDto'),
        }),
        expect.objectContaining({
          $ref: expect.stringContaining('TaskCommentResponseDto'),
        }),
      ]),
      discriminator: { propertyName: 'kind' },
    });
    expect(
      document.components.schemas.TaskActivityResponseDto?.properties?.kind
        ?.enum,
    ).toEqual(['activity']);
    expect(
      document.components.schemas.TaskActivityResponseDto?.properties?.action
        ?.enum,
    ).toContain('renewed');
    expect(
      document.components.schemas.TaskCommentResponseDto?.properties?.kind
        ?.enum,
    ).toEqual(['comment']);
    expect(
      document.components.schemas.TaskCommentResponseDto?.properties?.content,
    ).toMatchObject({ type: 'string', nullable: true, maxLength: 1000 });
    expect(
      document.components.schemas.TaskCommentResponseDto?.properties?.edited,
    ).toMatchObject({ type: 'boolean' });
    expect(
      document.components.schemas.TaskCommentResponseDto?.properties?.deletedAt,
    ).toMatchObject({ type: 'string', nullable: true, format: 'date-time' });
    expect(
      document.components.schemas.TaskCommentResponseDto?.properties
        ?.deletedByUsername,
    ).toMatchObject({ type: 'string', nullable: true });
    expect(
      document.components.schemas.ActorResponseDto?.properties?.username,
    ).toBeDefined();
    expect(
      document.components.schemas.CreateAdminUserDto?.properties,
    ).not.toHaveProperty('username');
    expect(
      document.components.schemas.TaskResponseDto?.properties?.workflowStatus
        ?.enum,
    ).toEqual([
      'not_started',
      'in_progress',
      'completed',
      'reopened',
      'closed',
    ]);
    expect(
      document.components.schemas.RenewExpiredTaskDto?.properties
        ?.recoveryStrategy?.enum,
    ).toEqual(['preserve_status', 'reopened']);
    expect(
      document.components.schemas.RenewExpiredTaskDto?.properties?.dueDate,
    ).toMatchObject({ format: 'date' });
    expect(
      document.components.schemas.ActorResponseDto?.properties?.permissions
        ?.items?.enum,
    ).toEqual([...ALL_PERMISSION_CODES]);
    expect(
      document.components.schemas.AdminUserResponseDto?.properties?.deletedAt,
    ).toMatchObject({ type: 'string', nullable: true, format: 'date-time' });
    expect(
      document.components.schemas.AdminUserResponseDto?.properties?.updatedAt,
    ).toMatchObject({ type: 'string', format: 'date-time' });
    expect(
      document.components.schemas.AdminRoleResponseDto?.properties?.deletedAt,
    ).toMatchObject({ type: 'string', nullable: true, format: 'date-time' });
    expect(
      document.components.schemas.AdminRoleResponseDto?.properties?.updatedAt,
    ).toMatchObject({ type: 'string', format: 'date-time' });
  });
});
