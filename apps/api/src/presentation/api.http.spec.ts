/** Verifies the public Fastify HTTP contract independently from PostgreSQL adapters. */
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppError } from '../common/application/app-error.js';
import { AUTHORIZATION } from '../authorization/application/ports/authorization.port.js';
import { ALL_PERMISSION_CODES } from '../authorization/domain/permission.js';
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
} from '../identity/application/ports/identity-directory.port.js';
import { ListDemoActors } from '../identity/application/use-cases/list-demo-actors.js';
import { DemoController } from '../identity/presentation/demo.controller.js';
import { DemoUserGuard } from '../identity/presentation/demo-user.guard.js';
import { ActOnTask } from '../tasks/application/use-cases/act-on-task.js';
import { CreateTask } from '../tasks/application/use-cases/create-task.js';
import { GetTask } from '../tasks/application/use-cases/get-task.js';
import { ListTasks } from '../tasks/application/use-cases/list-tasks.js';
import { ResetDemoTasks } from '../tasks/application/use-cases/reset-demo-tasks.js';
import type { TaskReadModel } from '../tasks/application/read-models/task-read-model.js';
import { DomainError } from '../tasks/domain/domain-error.js';
import { TasksController } from '../tasks/presentation/tasks.controller.js';

const TASK: TaskReadModel = {
  id: 'task-http',
  title: 'HTTP 契约任务',
  type: 'exploration',
  description: '响应不得泄漏 ORM 实体',
  reward: '15 金币',
  dueDate: '2026-09-08',
  publisher: { id: 'guild-master', name: '用户 A', role: 'user' },
  assignee: null,
  status: 'not_started',
  createdAt: '2026-08-30T09:00:00.000Z',
  updatedAt: '2026-08-30T09:00:00.000Z',
  version: 1,
  timeline: [
    {
      sequence: 1,
      action: 'created',
      actor: { id: 'guild-master', name: '用户 A', role: 'user' },
      at: '2026-08-30T09:00:00.000Z',
      detail: '任务发布至冒险家工会',
    },
  ],
};

const IDENTITIES: IdentityDirectoryPort = {
  /** Lists the two actors needed by HTTP boundary examples. */
  list: () =>
    Promise.resolve([
      TASK.publisher,
      { id: 'adventurer-a', name: '用户 B', role: 'user' },
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
        HealthController,
        AdminController,
      ],
      providers: [
        DemoUserGuard,
        PermissionGuard,
        { provide: IDENTITY_DIRECTORY, useValue: IDENTITIES },
        {
          provide: AUTHORIZATION,
          useValue: { hasPermission: () => Promise.resolve(true) },
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
                : Promise.reject(new AppError('TASK_NOT_FOUND', '任务不存在')),
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
              if (id === 'task-internal') {
                return Promise.reject(new Error('database password leaked'));
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
      headers: { 'x-demo-user-id': 'guild-master' },
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

  /** Proves the demo identity list is public and includes stable role labels. */
  it('lists demo users without requiring an identity header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/demo/users',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: 'guild-master',
        name: '用户 A',
        role: 'user',
        roleLabel: '演示用户',
      },
      {
        id: 'adventurer-a',
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
      headers: { 'x-demo-user-id': 'guild-master' },
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
      headers: { 'x-demo-user-id': 'guild-master' },
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

  /** Proves optimistic state conflicts map to status 409 with a stable code. */
  it('maps action version conflicts to 409', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks/task-conflict/actions',
      headers: { 'x-demo-user-id': 'guild-master' },
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
      headers: { 'x-demo-user-id': 'guild-master' },
      payload: { action: 'accept', expectedVersion: 1 },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code: 'ACTION_FORBIDDEN' },
    });
  });

  /** Proves unexpected failures are logged with diagnostics but return only a safe envelope. */
  it('logs unexpected failures without leaking details to HTTP clients', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks/task-internal/actions',
      headers: { 'x-demo-user-id': 'guild-master' },
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
      headers: { 'x-demo-user-id': 'guild-master' },
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
      paths: Record<
        string,
        {
          get?: { responses: Record<string, unknown> };
          post?: {
            parameters?: Array<{ name?: string }>;
            responses: Record<string, unknown>;
          };
          delete?: { responses: Record<string, unknown> };
        }
      >;
      components: {
        schemas: Record<
          string,
          {
            properties?: Record<
              string,
              { enum?: string[]; items?: { enum?: string[] } }
            >;
          }
        >;
      };
    }>();
    expect(document.paths).toHaveProperty('/api/v1/tasks');
    expect(
      document.paths['/api/v1/admin/users']?.post?.responses,
    ).toHaveProperty('404');
    expect(
      document.paths['/api/v1/admin/users/{id}']?.delete?.responses,
    ).toHaveProperty('204');
    expect(
      document.paths['/api/v1/admin/roles/{id}']?.delete?.responses,
    ).toHaveProperty('204');
    expect(document.paths['/api/v1/tasks']?.get?.responses).toHaveProperty(
      '401',
    );
    expect(document.paths['/api/v1/tasks']?.get?.responses).toHaveProperty(
      '403',
    );
    expect(document.paths).toHaveProperty('/health/ready');
    expect(
      document.paths['/api/v1/demo/reset']?.post?.responses,
    ).toHaveProperty('401');
    expect(
      document.paths['/api/v1/demo/reset']?.post?.responses,
    ).toHaveProperty('403');
    expect(
      document.paths['/api/v1/tasks/{taskId}/actions']?.post?.parameters,
    ).toContainEqual(expect.objectContaining({ name: 'X-Demo-User-Id' }));
    expect(
      document.paths['/api/v1/tasks/{taskId}/actions']?.post?.responses,
    ).toHaveProperty('409');
    expect(document.paths['/health/ready']?.get?.responses).toHaveProperty(
      '503',
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
    ]);
    expect(
      document.components.schemas.ActorResponseDto?.properties?.permissions
        ?.items?.enum,
    ).toEqual([...ALL_PERMISSION_CODES]);
  });
});
