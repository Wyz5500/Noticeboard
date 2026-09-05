/** Generates and checks the deterministic tracked OpenAPI v1 artifact. */
import type { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import type { OpenAPIObject } from '@nestjs/swagger';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OPENAPI_ARTIFACT_PATH = resolve(
  PROJECT_ROOT,
  'openapi',
  'v1',
  'noticeboard.openapi.json',
);

/** Recursively sorts JSON object keys while preserving array order. */
function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => [key, sortJsonValue(child)]),
  );
}

/** Serializes one OpenAPI document to the tracked deterministic JSON format. */
export function serializeOpenApiDocument(document: unknown): string {
  return `${JSON.stringify(sortJsonValue(document), null, 2)}\n`;
}

/** Loads the tsc-compiled application graph so decorator metadata is preserved. */
async function loadCompiledApplication(): Promise<{
  AppModule: Type<unknown>;
  configureHttpApplication: (app: NestFastifyApplication) => OpenAPIObject;
}> {
  const appModuleUrl = pathToFileURL(
    resolve(PROJECT_ROOT, 'dist', 'api', 'app.module.js'),
  ).href;
  const configureUrl = pathToFileURL(
    resolve(
      PROJECT_ROOT,
      'dist',
      'api',
      'common',
      'presentation',
      'configure-http-application.js',
    ),
  ).href;
  const [appModule, httpConfiguration] = await Promise.all([
    import(appModuleUrl) as Promise<{ AppModule: Type<unknown> }>,
    import(configureUrl) as Promise<{
      configureHttpApplication: (app: NestFastifyApplication) => OpenAPIObject;
    }>,
  ]);
  return {
    AppModule: appModule.AppModule,
    configureHttpApplication: httpConfiguration.configureHttpApplication,
  };
}

/** Builds the contract from the real AppModule and always closes its resources. */
async function generateOpenApiArtifactText(): Promise<string> {
  const { AppModule, configureHttpApplication } =
    await loadCompiledApplication();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { abortOnError: false, logger: false },
  );
  try {
    const document = configureHttpApplication(app);
    return serializeOpenApiDocument(document);
  } finally {
    await app.close();
  }
}

/** Replaces the tracked artifact atomically after producing complete content. */
async function writeOpenApiArtifact(content: string): Promise<void> {
  const temporaryPath = `${OPENAPI_ARTIFACT_PATH}.${process.pid}.tmp`;
  await mkdir(dirname(OPENAPI_ARTIFACT_PATH), { recursive: true });
  try {
    await writeFile(temporaryPath, content, 'utf8');
    await rename(temporaryPath, OPENAPI_ARTIFACT_PATH);
  } finally {
    await unlink(temporaryPath).catch((error: unknown) => {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      ) {
        throw error;
      }
    });
  }
}

/** Generates or byte-checks the tracked artifact for one CLI invocation. */
export async function runOpenApiArtifactCommand(
  argumentsFromCli: readonly string[],
): Promise<number> {
  const [command, ...extraArguments] = argumentsFromCli;
  if (
    (command !== 'generate' && command !== 'check') ||
    extraArguments.length > 0
  ) {
    process.stderr.write('用法：openapi-artifact <generate|check>\n');
    return 64;
  }
  try {
    const generated = await generateOpenApiArtifactText();
    if (command === 'generate') {
      await writeOpenApiArtifact(generated);
      process.stdout.write(
        `OpenAPI artifact 已生成：${OPENAPI_ARTIFACT_PATH}\n`,
      );
      return 0;
    }
    let tracked: string;
    try {
      tracked = await readFile(OPENAPI_ARTIFACT_PATH, 'utf8');
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        throw new Error(
          'OpenAPI artifact 不存在；请先运行 npm run openapi:generate',
          { cause: error },
        );
      }
      throw error;
    }
    if (tracked !== generated) {
      throw new Error(
        'OpenAPI artifact 与当前服务端不一致；请运行 npm run openapi:generate 并审查差异',
      );
    }
    process.stdout.write('OpenAPI artifact drift check passed\n');
    return 0;
  } catch (error: unknown) {
    process.stderr.write(
      `错误：${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await runOpenApiArtifactCommand(process.argv.slice(2));
}
