/** Boots the single Fastify service, static web assets, structured logging, and graceful shutdown. */
import fastifyStatic from '@fastify/static';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { join } from 'node:path';

import { AppModule } from './app.module.js';
import { loadRuntimeConfig } from './common/infrastructure/config/runtime-config.js';
import { createApplicationReadyRecord } from './common/infrastructure/logging/application-ready.js';
import { JsonLogger } from './common/infrastructure/logging/json-logger.js';
import { configureHttpApplication } from './common/presentation/configure-http-application.js';

/** Creates and starts the production application after validating all environment inputs. */
async function bootstrap(): Promise<void> {
  const config = loadRuntimeConfig();
  const adapter = new FastifyAdapter({ logger: true });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    { bufferLogs: true },
  );
  app.useLogger(new JsonLogger());
  configureHttpApplication(app);
  await app.register(fastifyStatic, {
    root: join(process.cwd(), 'dist', 'web'),
    prefix: '/',
  });
  app.enableShutdownHooks();
  await app.listen(config.port, config.host);
  const address = app.getHttpServer().address();
  if (!address || typeof address === 'string') {
    throw new Error('Application listen address is unavailable');
  }
  console.log(
    createApplicationReadyRecord(`http://${config.host}:${address.port}`),
  );
}

void bootstrap().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      level: 'fatal',
      message: error instanceof Error ? error.message : 'Unknown startup error',
    }),
  );
  process.exitCode = 1;
});
