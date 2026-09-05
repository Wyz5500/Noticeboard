/** Verifies structural OpenAPI v1 compatibility rules against hand-written contract fixtures. */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  findOpenApiCompatibilityErrors,
  runOpenApiCompatibilityCommand,
} from '../../scripts/check-openapi-compatibility.js';

type CompatibilityCommandForTest = (
  argumentsFromCli: readonly string[],
  options: {
    artifactPath: string;
    baselinesDirectory: string;
    stderr: { write(message: string): unknown };
    stdout: { write(message: string): unknown };
  },
) => Promise<number>;

/** Invokes the command with isolated filesystem and output dependencies. */
const runCompatibilityCommandForTest =
  runOpenApiCompatibilityCommand as CompatibilityCommandForTest;

describe('OpenAPI compatibility', () => {
  /** Rejects removing an existing operation that previously served clients. */
  it('rejects removed operations', () => {
    const baseline = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/api/v1/tasks': {
          get: {
            operationId: 'listTasks',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const candidate = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.1' },
      paths: {},
    };

    expect(findOpenApiCompatibilityErrors(baseline, candidate)).toEqual([
      'paths./api/v1/tasks: 已删除既有路径',
    ]);
  });

  /** Rejects removing one method while retaining its path object. */
  it('rejects removed methods', () => {
    const baseline = {
      paths: {
        '/api/v1/tasks': {
          get: {
            operationId: 'listTasks',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const candidate = { paths: { '/api/v1/tasks': {} } };

    expect(findOpenApiCompatibilityErrors(baseline, candidate)).toContain(
      'paths./api/v1/tasks.get: 已删除既有 HTTP operation',
    );
  });

  /** Rejects renaming a stable operation identifier consumed by code generation. */
  it('rejects changed operation identifiers', () => {
    const baseline = {
      paths: {
        '/api/v1/tasks': {
          get: {
            operationId: 'listTasks',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const candidate = {
      paths: {
        '/api/v1/tasks': {
          get: {
            operationId: 'findTasks',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    expect(findOpenApiCompatibilityErrors(baseline, candidate)).toContain(
      'paths./api/v1/tasks.get.operationId: 已从 listTasks 改为 findTasks',
    );
  });

  /** Rejects removing one documented response status from an existing operation. */
  it('rejects removed response statuses', () => {
    const baseline = {
      paths: {
        '/api/v1/tasks': {
          get: {
            operationId: 'listTasks',
            responses: {
              '200': { description: 'OK' },
              '403': { description: 'Forbidden' },
            },
          },
        },
      },
    };
    const candidate = {
      paths: {
        '/api/v1/tasks': {
          get: {
            operationId: 'listTasks',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    expect(findOpenApiCompatibilityErrors(baseline, candidate)).toContain(
      'paths./api/v1/tasks.get.responses.403: 已删除既有响应状态',
    );
  });

  /** Rejects narrowing or deleting fields from an existing public schema. */
  it('rejects incompatible schema changes', () => {
    const baseline = {
      paths: {},
      components: {
        schemas: {
          Task: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string' },
              status: { type: 'string', enum: ['open', 'closed'] },
              title: { type: 'string', minLength: 1, maxLength: 100 },
              dueDate: { type: 'string', format: 'date' },
            },
          },
        },
      },
    };
    const candidate = {
      paths: {},
      components: {
        schemas: {
          Task: {
            type: 'object',
            required: ['id', 'title'],
            properties: {
              id: { type: 'number' },
              status: { type: 'string', enum: ['open', 'closed', 'expired'] },
              title: { type: 'string', minLength: 2, maxLength: 50 },
            },
          },
        },
      },
    };

    expect(findOpenApiCompatibilityErrors(baseline, candidate)).toEqual(
      expect.arrayContaining([
        'components.schemas.Task.required.title: 新增了必填字段',
        'components.schemas.Task.properties.dueDate: 已删除既有字段',
        'components.schemas.Task.properties.id.type: 已从 string 改为 number',
        'components.schemas.Task.properties.status.enum: 已改变既有枚举成员',
        'components.schemas.Task.properties.title.minLength: 已从 1 收紧为 2',
        'components.schemas.Task.properties.title.maxLength: 已从 100 收紧为 50',
      ]),
    );
  });

  /** Rejects making a previously required response field optional. */
  it('rejects removing required schema fields', () => {
    const baseline = {
      paths: {},
      components: {
        schemas: {
          Task: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' } },
          },
        },
      },
    };
    const candidate = {
      paths: {},
      components: {
        schemas: {
          Task: {
            type: 'object',
            properties: { id: { type: 'string' } },
          },
        },
      },
    };

    expect(findOpenApiCompatibilityErrors(baseline, candidate)).toContain(
      'components.schemas.Task.required.id: 既有必填字段已改为可选',
    );
  });

  /** Rejects adding schema keywords that narrow or alter existing values. */
  it('rejects newly added schema constraints', () => {
    const baseline = {
      paths: {},
      components: {
        schemas: {
          Task: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              note: { type: 'string' },
              metadata: { type: 'object' },
              tags: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    };
    const candidate = {
      paths: {},
      components: {
        schemas: {
          Task: {
            type: 'object',
            properties: {
              code: { type: 'string', pattern: '^[A-Z]+$' },
              note: { type: 'string', nullable: true },
              metadata: { type: 'object', additionalProperties: false },
              tags: {
                type: 'array',
                uniqueItems: true,
                items: { type: 'string' },
              },
            },
          },
        },
      },
    };

    expect(findOpenApiCompatibilityErrors(baseline, candidate)).toEqual(
      expect.arrayContaining([
        'components.schemas.Task.properties.code.pattern: 新增了 schema 限定值 ^[A-Z]+$',
        'components.schemas.Task.properties.note.nullable: 新增了 schema 限定值 true',
        'components.schemas.Task.properties.metadata.additionalProperties: 新增了 schema 限定值 false',
        'components.schemas.Task.properties.tags.uniqueItems: 新增了 schema 限定值 true',
      ]),
    );
  });

  /** Allows additive paths and optional fields while ignoring descriptive metadata changes. */
  it('allows compatible additive changes', () => {
    const baseline = {
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Task: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', description: '旧描述' } },
          },
        },
      },
    };
    const candidate = {
      info: { title: 'Test renamed', version: '1.1.0' },
      paths: {
        '/api/v1/tasks': {
          get: {
            operationId: 'listTasks',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
      components: {
        schemas: {
          Task: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', description: '新描述' },
              note: { type: 'string' },
            },
          },
          NewResource: { type: 'object', properties: {} },
        },
      },
    };

    expect(findOpenApiCompatibilityErrors(baseline, candidate)).toEqual([]);
  });

  /** Rejects removing parameters or making an optional parameter mandatory. */
  it('rejects incompatible parameter changes', () => {
    const baseline = {
      paths: {
        '/api/v1/tasks': {
          get: {
            operationId: 'listTasks',
            parameters: [
              {
                in: 'header',
                name: 'X-Demo-User-Id',
                required: false,
                schema: { type: 'string' },
              },
              {
                in: 'query',
                name: 'search',
                required: false,
                schema: { type: 'string' },
              },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const candidate = {
      paths: {
        '/api/v1/tasks': {
          get: {
            operationId: 'listTasks',
            parameters: [
              {
                in: 'header',
                name: 'X-Demo-User-Id',
                required: true,
                schema: { type: 'string' },
              },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    expect(findOpenApiCompatibilityErrors(baseline, candidate)).toEqual(
      expect.arrayContaining([
        'paths./api/v1/tasks.get.parameters.header:X-Demo-User-Id.required: 可选参数已改为必填',
        'paths./api/v1/tasks.get.parameters.query:search: 已删除既有参数',
      ]),
    );
  });

  /** Rejects requiring a body or removing one of its accepted media types. */
  it('rejects incompatible request body changes', () => {
    const baseline = {
      paths: {
        '/api/v1/tasks': {
          post: {
            operationId: 'createTask',
            requestBody: {
              required: false,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateTask' },
                },
              },
            },
            responses: { '201': { description: 'Created' } },
          },
        },
      },
    };
    const candidate = {
      paths: {
        '/api/v1/tasks': {
          post: {
            operationId: 'createTask',
            requestBody: {
              required: true,
              content: {
                'application/xml': {
                  schema: { $ref: '#/components/schemas/CreateTask' },
                },
              },
            },
            responses: { '201': { description: 'Created' } },
          },
        },
      },
    };

    expect(findOpenApiCompatibilityErrors(baseline, candidate)).toEqual(
      expect.arrayContaining([
        'paths./api/v1/tasks.post.requestBody.required: 可选请求体已改为必填',
        'paths./api/v1/tasks.post.requestBody.content.application/json: 已删除既有媒体类型',
      ]),
    );
  });

  /** Rejects adding a new required parameter to an existing operation. */
  it('rejects newly required parameters', () => {
    const baseline = {
      paths: {
        '/api/v1/tasks': {
          get: {
            operationId: 'listTasks',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const candidate = {
      paths: {
        '/api/v1/tasks': {
          get: {
            operationId: 'listTasks',
            parameters: [
              {
                in: 'query',
                name: 'tenant',
                required: true,
                schema: { type: 'string' },
              },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    expect(findOpenApiCompatibilityErrors(baseline, candidate)).toContain(
      'paths./api/v1/tasks.get.parameters.query:tenant: 新增了必填参数',
    );
  });

  /** Rejects adding a required request body to a previously bodyless operation. */
  it('rejects newly required request bodies', () => {
    const baseline = {
      paths: {
        '/api/v1/tasks/{taskId}/actions': {
          post: {
            operationId: 'actOnTask',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const candidate = {
      paths: {
        '/api/v1/tasks/{taskId}/actions': {
          post: {
            operationId: 'actOnTask',
            requestBody: {
              required: true,
              content: {
                'application/json': { schema: { type: 'object' } },
              },
            },
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    expect(findOpenApiCompatibilityErrors(baseline, candidate)).toContain(
      'paths./api/v1/tasks/{taskId}/actions.post.requestBody: 新增了必填请求体',
    );
  });

  /** Rejects removing a documented response media type from a retained status. */
  it('rejects incompatible response content changes', () => {
    const baseline = {
      paths: {
        '/api/v1/tasks': {
          get: {
            operationId: 'listTasks',
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    };
    const candidate = {
      paths: {
        '/api/v1/tasks': {
          get: {
            operationId: 'listTasks',
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/xml': {
                    schema: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    };

    expect(findOpenApiCompatibilityErrors(baseline, candidate)).toContain(
      'paths./api/v1/tasks.get.responses.200.content.application/json: 已删除既有媒体类型',
    );
  });

  /** Rejects adding or changing document-level security requirements. */
  it('rejects changed root security requirements', () => {
    const baseline = { paths: {} };
    const candidate = {
      paths: {},
      security: [{ 'demo-user': [] }],
    };

    expect(findOpenApiCompatibilityErrors(baseline, candidate)).toContain(
      'security: 已改变全局安全要求',
    );
  });

  /** Rejects changing the definition behind an existing security scheme name. */
  it('rejects changed security schemes', () => {
    const baseline = {
      paths: {},
      components: {
        securitySchemes: {
          'demo-user': {
            type: 'apiKey',
            in: 'header',
            name: 'X-Demo-User-Id',
          },
        },
      },
    };
    const candidate = {
      paths: {},
      components: {
        securitySchemes: {
          'demo-user': {
            type: 'apiKey',
            in: 'header',
            name: 'Authorization',
          },
        },
      },
    };

    expect(findOpenApiCompatibilityErrors(baseline, candidate)).toContain(
      'components.securitySchemes.demo-user: 已改变既有安全方案',
    );
  });

  /** Fails closed when no explicit supported v1 baseline has been committed. */
  it('rejects an empty supported baseline directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noticeboard-openapi-'));
    const artifactPath = join(root, 'noticeboard.openapi.json');
    const baselinesDirectory = join(root, 'baselines');
    const stdout: string[] = [];
    const stderr: string[] = [];
    try {
      await writeFile(artifactPath, JSON.stringify({ paths: {} }), 'utf8');
      await mkdir(baselinesDirectory);

      const exitCode = await runCompatibilityCommandForTest([], {
        artifactPath,
        baselinesDirectory,
        stdout: { write: (message) => stdout.push(String(message)) },
        stderr: { write: (message) => stderr.push(String(message)) },
      });

      expect(exitCode).toBe(1);
      expect(stdout).toEqual([]);
      expect(stderr.join('')).toContain('未找到受支持的 OpenAPI v1 基线');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  /** Compares the candidate against explicit baseline files instead of Git history. */
  it('checks explicit supported baseline files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noticeboard-openapi-'));
    const artifactPath = join(root, 'noticeboard.openapi.json');
    const baselinesDirectory = join(root, 'baselines');
    const stdout: string[] = [];
    const stderr: string[] = [];
    try {
      await mkdir(baselinesDirectory);
      await writeFile(artifactPath, JSON.stringify({ paths: {} }), 'utf8');
      await writeFile(
        join(baselinesDirectory, '1.0.0.openapi.json'),
        JSON.stringify({
          paths: {
            '/api/v1/tasks': {
              get: {
                operationId: 'listTasks',
                responses: { '200': { description: 'OK' } },
              },
            },
          },
        }),
        'utf8',
      );

      const exitCode = await runCompatibilityCommandForTest([], {
        artifactPath,
        baselinesDirectory,
        stdout: { write: (message) => stdout.push(String(message)) },
        stderr: { write: (message) => stderr.push(String(message)) },
      });

      expect(exitCode).toBe(1);
      expect(stdout).toEqual([]);
      expect(stderr.join('')).toContain(
        '1.0.0.openapi.json paths./api/v1/tasks: 已删除既有路径',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  /** Rejects changing operation security because it alters request authorization semantics. */
  it('rejects changed security requirements', () => {
    const baseline = {
      paths: {
        '/api/v1/tasks': {
          get: {
            operationId: 'listTasks',
            security: [{ 'demo-user': [] }],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const candidate = {
      paths: {
        '/api/v1/tasks': {
          get: {
            operationId: 'listTasks',
            security: [],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    expect(findOpenApiCompatibilityErrors(baseline, candidate)).toContain(
      'paths./api/v1/tasks.get.security: 已改变既有安全要求',
    );
  });
});
