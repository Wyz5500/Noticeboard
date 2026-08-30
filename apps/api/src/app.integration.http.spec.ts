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
      headers: { 'x-demo-user-id': 'guild-master' },
    });
    expect(reset.statusCode).toBe(200);

    const seeded = await app.inject({ method: 'GET', url: '/api/v1/tasks' });
    expect(seeded.json().map((task: { id: string }) => task.id)).toEqual([
      'task-herbs',
      'task-outpost',
      'task-lanterns',
      'task-starfire',
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
});
