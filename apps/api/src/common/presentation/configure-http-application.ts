/** Applies API versioning, validation, error mapping, and OpenAPI consistently in runtime and tests. */
import {
  RequestMethod,
  ValidationPipe,
  VersioningType,
  type LoggerService,
} from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';

import { ApiErrorFilter } from './api-error.filter.js';

/** Collects component schema names referenced by one OpenAPI subtree. */
function collectSchemaReferences(
  value: unknown,
  references: Set<string>,
): void {
  if (Array.isArray(value)) {
    for (const child of value) collectSchemaReferences(child, references);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  const record = value as Record<string, unknown>;
  const reference = record['$ref'];
  if (
    typeof reference === 'string' &&
    reference.startsWith('#/components/schemas/')
  ) {
    references.add(reference.slice('#/components/schemas/'.length));
  }
  for (const child of Object.values(record)) {
    collectSchemaReferences(child, references);
  }
}

/** Restricts the generated document to the versioned client API and reachable schemas. */
function retainClientApiContract(document: OpenAPIObject): OpenAPIObject {
  document.paths = Object.fromEntries(
    Object.entries(document.paths).filter(([path]) =>
      path.startsWith('/api/v1/'),
    ),
  );
  const components = document.components;
  const schemas = components?.schemas;
  if (!schemas) return document;
  const references = new Set<string>();
  collectSchemaReferences(document.paths, references);
  const processed = new Set<string>();
  while (processed.size < references.size) {
    for (const name of references) {
      if (processed.has(name)) continue;
      processed.add(name);
      collectSchemaReferences(schemas[name], references);
    }
  }
  components.schemas = Object.fromEntries(
    Object.entries(schemas).filter(([name]) => references.has(name)),
  );
  return document;
}

/** Builds the public OpenAPI document from the configured real application graph. */
export function createOpenApiDocument(
  app: NestFastifyApplication,
): OpenAPIObject {
  const openApi = new DocumentBuilder()
    .setTitle('告示牌 Noticeboard API')
    .setDescription('演示身份与任务状态机的 demo-only REST 契约')
    .setVersion('1.0.0')
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'X-Demo-User-Id' },
      'demo-user',
    )
    .build();
  return retainClientApiContract(SwaggerModule.createDocument(app, openApi));
}

/** Configures the complete public HTTP surface before the application begins listening. */
export function configureHttpApplication(
  app: NestFastifyApplication,
  errorLogger?: Pick<LoggerService, 'error'>,
): OpenAPIObject {
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

  const document = createOpenApiDocument(app);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/openapi.json',
  });
  return document;
}
