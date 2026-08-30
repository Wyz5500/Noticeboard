/** Applies API versioning, validation, error mapping, and OpenAPI consistently in runtime and tests. */
import {
  RequestMethod,
  ValidationPipe,
  VersioningType,
  type LoggerService,
} from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { ApiErrorFilter } from './api-error.filter.js';

/** Configures the complete public HTTP surface before the application begins listening. */
export function configureHttpApplication(
  app: NestFastifyApplication,
  errorLogger?: Pick<LoggerService, 'error'>,
): void {
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.enableVersioning({ type: VersioningType.URI, prefix: 'v' });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new ApiErrorFilter(errorLogger));

  const openApi = new DocumentBuilder()
    .setTitle('冒险家工会任务 API')
    .setDescription('演示身份与任务状态机的 demo-only REST 契约')
    .setVersion('1.0.0')
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'X-Demo-User-Id' },
      'demo-user',
    )
    .build();
  const document = SwaggerModule.createDocument(app, openApi);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/openapi.json',
  });
}
