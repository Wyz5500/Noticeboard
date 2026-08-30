/** Verifies real Nest module composition through Fastify and PostgreSQL boundaries together. */
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './app.module.js';
import { configureHttpApplication } from './common/presentation/configure-http-application.js';

const DATABASE_URL = process.env.DATABASE_URL_TEST;
const describeDatabase = DATABASE_URL ? describe : describe.skip;

describeDatabase('application composition', () => {
  let app: NestFastifyApplication;

  /** Starts the production module graph against the migrated contract database. */
  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL!;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    configureHttpApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  /** Closes the real TypeORM pool and Fastify instance after integration checks. */
  afterAll(async () => {
    await app.close();
  });

  /** Proves reset, list, create, and action commands traverse the full production module graph. */
  it('runs the demo task flow through real adapters', async () => {
    const reset = await app.inject({
      method: 'POST',
      url: '/api/v1/demo/reset',
      headers: { 'x-demo-user-id': 'guild-admin' },
    });
    expect(reset.statusCode).toBe(200);

    const seeded = await app.inject({
      method: 'GET',
      url: '/api/v1/tasks',
      headers: { 'x-demo-user-id': 'guild-master' },
    });
    expect(seeded.json().map((task: { id: string }) => task.id)).toEqual([
      'task-herbs',
      'task-outpost',
      'task-lanterns',
      'task-starfire',
      'task-village',
      'task-quarry',
      'task-beacon',
      'task-harbor',
      'task-grove',
      'task-portal',
      'task-nether',
      'task-bridge',
    ]);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: { 'x-demo-user-id': 'adventurer-a' },
      payload: {
        title: '组合测试任务',
        type: 'bounty',
        description: '验证真实模块装配',
        reward: '45 金币',
        dueDate: '2026-09-12',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      publisher: { id: 'adventurer-a' },
      version: 1,
    });

    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${created.json().id as string}/actions`,
      headers: { 'x-demo-user-id': 'adventurer-b' },
      payload: { action: 'accept', expectedVersion: 1 },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({
      status: 'in_progress',
      assignee: { id: 'adventurer-b' },
      version: 2,
    });
  });

  /** Proves the production readiness adapter performs a real database query. */
  it('reports PostgreSQL readiness through the production health port', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready', database: 'up' });
  });

  /** Proves administrator CRUD, role occupancy conflicts, and ordinary-user denial through PostgreSQL. */
  it('runs the authorization management flow through real adapters', async () => {
    const ordinary = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
      headers: { 'x-demo-user-id': 'guild-master' },
    });
    expect(ordinary.statusCode).toBe(403);

    const overview = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
      headers: { 'x-demo-user-id': 'guild-admin' },
    });
    expect(overview.statusCode).toBe(200);
    expect(overview.json().roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'system_admin', builtin: true }),
        expect.objectContaining({ code: 'user', builtin: true }),
      ]),
    );
    expect(overview.json().permissions).toHaveLength(8);

    const invalidBuiltinEdit = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/roles/role-user',
      headers: { 'x-demo-user-id': 'guild-admin' },
      payload: { name: '不可修改的用户角色', permissions: ['tasks.view'] },
    });
    expect(invalidBuiltinEdit.statusCode).toBe(400);
    expect(invalidBuiltinEdit.json()).toMatchObject({
      error: { code: 'VALIDATION_FAILED' },
    });

    const roleName = `集成测试角色-${Date.now()}`;
    const role = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/roles',
      headers: { 'x-demo-user-id': 'guild-admin' },
      payload: { name: roleName },
    });
    expect(role.statusCode).toBe(201);
    expect(role.json()).toMatchObject({ name: roleName, permissions: [] });

    const missingRoleUser = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: { 'x-demo-user-id': 'guild-admin' },
      payload: { name: '不存在角色用户', roleId: 'role-does-not-exist' },
    });
    expect(missingRoleUser.statusCode).toBe(404);
    expect(missingRoleUser.json()).toMatchObject({
      error: { code: 'ROLE_NOT_FOUND' },
    });

    const user = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: { 'x-demo-user-id': 'guild-admin' },
      payload: { name: '集成测试用户', roleId: role.json().id as string },
    });
    expect(user.statusCode).toBe(201);

    const occupied = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/roles/${role.json().id as string}`,
      headers: { 'x-demo-user-id': 'guild-admin' },
    });
    expect(occupied.statusCode).toBe(409);
    expect(occupied.json()).toMatchObject({ error: { code: 'ROLE_IN_USE' } });

    const deletedUser = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/users/${user.json().id as string}`,
      headers: { 'x-demo-user-id': 'guild-admin' },
    });
    expect(deletedUser.statusCode).toBe(204);

    const reassignedUser = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${user.json().id as string}`,
      headers: { 'x-demo-user-id': 'guild-admin' },
      payload: { roleId: 'role-user' },
    });
    expect(reassignedUser.statusCode).toBe(200);

    const deletedRole = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/roles/${role.json().id as string}`,
      headers: { 'x-demo-user-id': 'guild-admin' },
    });
    expect(deletedRole.statusCode).toBe(204);

    const lastAdmin = await app.inject({
      method: 'DELETE',
      url: '/api/v1/admin/users/guild-admin',
      headers: { 'x-demo-user-id': 'guild-admin' },
    });
    expect(lastAdmin.statusCode).toBe(409);
  });
});
