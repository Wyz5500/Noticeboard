/** Checks a candidate OpenAPI contract against explicit supported v1 baselines. */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT_RELATIVE_PATH = 'openapi/v1/noticeboard.openapi.json';
const ARTIFACT_PATH = resolve(PROJECT_ROOT, ARTIFACT_RELATIVE_PATH);
const BASELINES_RELATIVE_PATH = 'openapi/v1/baselines';
const BASELINES_DIRECTORY = resolve(PROJECT_ROOT, BASELINES_RELATIVE_PATH);
const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'patch',
  'options',
  'head',
  'trace',
] as const;
const EXACT_SCHEMA_KEYS = [
  '$ref',
  'type',
  'format',
  'default',
  'pattern',
  'nullable',
  'additionalProperties',
  'discriminator',
  'oneOf',
  'anyOf',
  'allOf',
  'uniqueItems',
] as const;
const MINIMUM_SCHEMA_KEYS = [
  'minLength',
  'minimum',
  'exclusiveMinimum',
  'minItems',
  'minProperties',
] as const;
const MAXIMUM_SCHEMA_KEYS = [
  'maxLength',
  'maximum',
  'exclusiveMaximum',
  'maxItems',
  'maxProperties',
] as const;

interface SupportedArtifact {
  source: string;
  document: unknown;
}

interface TextWriter {
  write(message: string): unknown;
}

interface CompatibilityCommandOptions {
  artifactPath: string;
  baselinesDirectory: string;
  stderr: TextWriter;
  stdout: TextWriter;
}

/** Narrows unknown JSON values to object records. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads one object property as a record or returns an empty record. */
function recordProperty(
  value: Record<string, unknown>,
  property: string,
): Record<string, unknown> {
  const candidate = value[property];
  return isRecord(candidate) ? candidate : {};
}

/** Compares JSON-compatible values without depending on object key order. */
function jsonEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => jsonEquals(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    jsonEquals(leftKeys, rightKeys) &&
    leftKeys.every((key) => jsonEquals(left[key], right[key]))
  );
}

/** Formats one changed scalar schema keyword. */
function changedValueError(
  location: string,
  keyword: string,
  baseline: unknown,
  candidate: unknown,
): string {
  return `${location}.${keyword}: 已从 ${String(baseline)} 改为 ${String(candidate)}`;
}

/** Reports whether a numeric lower-bound constraint became stricter. */
function minimumConstraintTightened(
  baseline: unknown,
  candidate: unknown,
): boolean {
  if (typeof candidate !== 'number') return false;
  return typeof baseline !== 'number' || candidate > baseline;
}

/** Reports whether a numeric upper-bound constraint became stricter. */
function maximumConstraintTightened(
  baseline: unknown,
  candidate: unknown,
): boolean {
  if (typeof candidate !== 'number') return false;
  return typeof baseline !== 'number' || candidate < baseline;
}

/** Compares one retained schema recursively while allowing optional additions. */
function schemaErrors(
  location: string,
  baselineSchema: Record<string, unknown>,
  candidateSchema: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  for (const keyword of EXACT_SCHEMA_KEYS) {
    if (jsonEquals(baselineSchema[keyword], candidateSchema[keyword])) continue;
    if (!(keyword in baselineSchema) && keyword in candidateSchema) {
      errors.push(
        `${location}.${keyword}: 新增了 schema 限定值 ${String(candidateSchema[keyword])}`,
      );
      continue;
    }
    if (keyword in baselineSchema) {
      errors.push(
        changedValueError(
          location,
          keyword,
          baselineSchema[keyword],
          candidateSchema[keyword],
        ),
      );
    }
  }
  if (
    (Array.isArray(baselineSchema.enum) ||
      Array.isArray(candidateSchema.enum)) &&
    !jsonEquals(baselineSchema.enum, candidateSchema.enum)
  ) {
    errors.push(`${location}.enum: 已改变既有枚举成员`);
  }
  // OpenAPI 3.0 exclusivity modifies its numeric endpoint; a wider endpoint
  // remains compatible even when the candidate excludes that new endpoint.
  for (const [bound, exclusive] of [
    ['minimum', 'exclusiveMinimum'],
    ['maximum', 'exclusiveMaximum'],
  ] as const) {
    if (
      typeof candidateSchema[bound] === 'number' &&
      candidateSchema[bound] === baselineSchema[bound] &&
      candidateSchema[exclusive] === true &&
      baselineSchema[exclusive] !== true
    ) {
      errors.push(`${location}.${exclusive}: 已将既有 ${bound} 边界改为排他`);
    }
  }
  for (const keyword of MINIMUM_SCHEMA_KEYS) {
    if (
      minimumConstraintTightened(
        baselineSchema[keyword],
        candidateSchema[keyword],
      )
    ) {
      const baselineValue =
        typeof baselineSchema[keyword] === 'number'
          ? baselineSchema[keyword]
          : '无限制';
      errors.push(
        `${location}.${keyword}: 已从 ${baselineValue} 收紧为 ${String(candidateSchema[keyword])}`,
      );
    }
  }
  for (const keyword of MAXIMUM_SCHEMA_KEYS) {
    if (
      maximumConstraintTightened(
        baselineSchema[keyword],
        candidateSchema[keyword],
      )
    ) {
      const baselineValue =
        typeof baselineSchema[keyword] === 'number'
          ? baselineSchema[keyword]
          : '无限制';
      errors.push(
        `${location}.${keyword}: 已从 ${baselineValue} 收紧为 ${String(candidateSchema[keyword])}`,
      );
    }
  }
  const baselineRequired = new Set(
    Array.isArray(baselineSchema.required)
      ? baselineSchema.required.filter(
          (property): property is string => typeof property === 'string',
        )
      : [],
  );
  const candidateRequired = new Set(
    Array.isArray(candidateSchema.required)
      ? candidateSchema.required.filter(
          (property): property is string => typeof property === 'string',
        )
      : [],
  );
  for (const property of baselineRequired) {
    if (!candidateRequired.has(property)) {
      errors.push(`${location}.required.${property}: 既有必填字段已改为可选`);
    }
  }
  for (const property of candidateRequired) {
    if (!baselineRequired.has(property)) {
      errors.push(`${location}.required.${property}: 新增了必填字段`);
    }
  }
  const baselineProperties = recordProperty(baselineSchema, 'properties');
  const candidateProperties = recordProperty(candidateSchema, 'properties');
  for (const [property, baselineProperty] of Object.entries(
    baselineProperties,
  )) {
    const propertyLocation = `${location}.properties.${property}`;
    const candidateProperty = candidateProperties[property];
    if (!isRecord(candidateProperty)) {
      errors.push(`${propertyLocation}: 已删除既有字段`);
      continue;
    }
    if (isRecord(baselineProperty)) {
      errors.push(
        ...schemaErrors(propertyLocation, baselineProperty, candidateProperty),
      );
    }
  }
  if (isRecord(baselineSchema.items)) {
    if (!isRecord(candidateSchema.items)) {
      errors.push(`${location}.items: 已删除既有数组元素 schema`);
    } else {
      errors.push(
        ...schemaErrors(
          `${location}.items`,
          baselineSchema.items,
          candidateSchema.items,
        ),
      );
    }
  }
  return errors;
}

/** Reports component schema removals and narrowing changes. */
function componentSchemaErrors(
  baseline: Record<string, unknown>,
  candidate: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  const baselineSchemas = recordProperty(
    recordProperty(baseline, 'components'),
    'schemas',
  );
  const candidateSchemas = recordProperty(
    recordProperty(candidate, 'components'),
    'schemas',
  );
  for (const [name, baselineSchema] of Object.entries(baselineSchemas)) {
    const location = `components.schemas.${name}`;
    const candidateSchema = candidateSchemas[name];
    if (!isRecord(candidateSchema)) {
      errors.push(`${location}: 已删除既有 schema`);
      continue;
    }
    if (isRecord(baselineSchema)) {
      errors.push(...schemaErrors(location, baselineSchema, candidateSchema));
    }
  }
  return errors;
}

/** Reports removed or changed component security scheme definitions. */
function securitySchemeErrors(
  baseline: Record<string, unknown>,
  candidate: Record<string, unknown>,
): string[] {
  const baselineSchemes = recordProperty(
    recordProperty(baseline, 'components'),
    'securitySchemes',
  );
  const candidateSchemes = recordProperty(
    recordProperty(candidate, 'components'),
    'securitySchemes',
  );
  return Object.entries(baselineSchemes).flatMap(([name, baselineScheme]) =>
    jsonEquals(baselineScheme, candidateSchemes[name])
      ? []
      : [`components.securitySchemes.${name}: 已改变既有安全方案`],
  );
}

/** Creates stable identities for inline OpenAPI parameters. */
function parameterKey(parameter: Record<string, unknown>): string | null {
  return typeof parameter.in === 'string' && typeof parameter.name === 'string'
    ? `${parameter.in}:${parameter.name}`
    : null;
}

/** Reports removed, newly required, or narrowed operation parameters. */
function parameterErrors(
  location: string,
  baselineParameters: unknown,
  candidateParameters: unknown,
): string[] {
  const baselineByKey = new Map<string, Record<string, unknown>>();
  if (Array.isArray(baselineParameters)) {
    for (const baselineParameter of baselineParameters) {
      if (!isRecord(baselineParameter)) continue;
      const key = parameterKey(baselineParameter);
      if (key) baselineByKey.set(key, baselineParameter);
    }
  }
  const candidateByKey = new Map<string, Record<string, unknown>>();
  if (Array.isArray(candidateParameters)) {
    for (const candidateParameter of candidateParameters) {
      if (!isRecord(candidateParameter)) continue;
      const key = parameterKey(candidateParameter);
      if (key) candidateByKey.set(key, candidateParameter);
    }
  }
  const errors: string[] = [];
  for (const [key, baselineParameter] of baselineByKey) {
    const parameterLocation = `${location}.parameters.${key}`;
    const candidateParameter = candidateByKey.get(key);
    if (!candidateParameter) {
      errors.push(`${parameterLocation}: 已删除既有参数`);
      continue;
    }
    if (
      baselineParameter.required !== true &&
      candidateParameter.required === true
    ) {
      errors.push(`${parameterLocation}.required: 可选参数已改为必填`);
    }
    if (isRecord(baselineParameter.schema)) {
      if (!isRecord(candidateParameter.schema)) {
        errors.push(`${parameterLocation}.schema: 已删除既有参数 schema`);
      } else {
        errors.push(
          ...schemaErrors(
            `${parameterLocation}.schema`,
            baselineParameter.schema,
            candidateParameter.schema,
          ),
        );
      }
    }
  }
  for (const [key, candidateParameter] of candidateByKey) {
    if (!baselineByKey.has(key) && candidateParameter.required === true) {
      errors.push(`${location}.parameters.${key}: 新增了必填参数`);
    }
  }
  return errors;
}

/** Reports request-body requiredness and accepted media-type regressions. */
function requestBodyErrors(
  location: string,
  baselineBody: unknown,
  candidateBody: unknown,
): string[] {
  if (!isRecord(baselineBody)) {
    return isRecord(candidateBody) && candidateBody.required === true
      ? [`${location}.requestBody: 新增了必填请求体`]
      : [];
  }
  if (!isRecord(candidateBody)) {
    return [`${location}.requestBody: 已删除既有请求体`];
  }
  const errors: string[] = [];
  if (baselineBody.required !== true && candidateBody.required === true) {
    errors.push(`${location}.requestBody.required: 可选请求体已改为必填`);
  }
  const baselineContent = recordProperty(baselineBody, 'content');
  const candidateContent = recordProperty(candidateBody, 'content');
  for (const [mediaType, baselineMedia] of Object.entries(baselineContent)) {
    const mediaLocation = `${location}.requestBody.content.${mediaType}`;
    const candidateMedia = candidateContent[mediaType];
    if (!isRecord(candidateMedia)) {
      errors.push(`${mediaLocation}: 已删除既有媒体类型`);
      continue;
    }
    if (isRecord(baselineMedia) && isRecord(baselineMedia.schema)) {
      if (!isRecord(candidateMedia.schema)) {
        errors.push(`${mediaLocation}.schema: 已删除既有请求 schema`);
      } else {
        errors.push(
          ...schemaErrors(
            `${mediaLocation}.schema`,
            baselineMedia.schema,
            candidateMedia.schema,
          ),
        );
      }
    }
  }
  return errors;
}

/** Reports removed response media types and narrowed inline response schemas. */
function responseContentErrors(
  location: string,
  baselineResponse: unknown,
  candidateResponse: unknown,
): string[] {
  if (!isRecord(baselineResponse) || !isRecord(candidateResponse)) return [];
  const errors: string[] = [];
  const baselineContent = recordProperty(baselineResponse, 'content');
  const candidateContent = recordProperty(candidateResponse, 'content');
  for (const [mediaType, baselineMedia] of Object.entries(baselineContent)) {
    const mediaLocation = `${location}.content.${mediaType}`;
    const candidateMedia = candidateContent[mediaType];
    if (!isRecord(candidateMedia)) {
      errors.push(`${mediaLocation}: 已删除既有媒体类型`);
      continue;
    }
    if (isRecord(baselineMedia) && isRecord(baselineMedia.schema)) {
      if (!isRecord(candidateMedia.schema)) {
        errors.push(`${mediaLocation}.schema: 已删除既有响应 schema`);
      } else {
        errors.push(
          ...schemaErrors(
            `${mediaLocation}.schema`,
            baselineMedia.schema,
            candidateMedia.schema,
          ),
        );
      }
    }
  }
  return errors;
}

/** Reports operation-level compatibility failures for one retained path. */
function operationErrors(
  path: string,
  baselinePath: Record<string, unknown>,
  candidatePath: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  for (const method of HTTP_METHODS) {
    const baselineOperation = baselinePath[method];
    if (!isRecord(baselineOperation)) continue;
    const location = `paths.${path}.${method}`;
    const candidateOperation = candidatePath[method];
    if (!isRecord(candidateOperation)) {
      errors.push(`${location}: 已删除既有 HTTP operation`);
      continue;
    }
    if (baselineOperation.operationId !== candidateOperation.operationId) {
      errors.push(
        `${location}.operationId: 已从 ${String(baselineOperation.operationId)} 改为 ${String(candidateOperation.operationId)}`,
      );
    }
    if (!jsonEquals(baselineOperation.security, candidateOperation.security)) {
      errors.push(`${location}.security: 已改变既有安全要求`);
    }
    errors.push(
      ...parameterErrors(
        location,
        baselineOperation.parameters,
        candidateOperation.parameters,
      ),
      ...requestBodyErrors(
        location,
        baselineOperation.requestBody,
        candidateOperation.requestBody,
      ),
    );
    const baselineResponses = recordProperty(baselineOperation, 'responses');
    const candidateResponses = recordProperty(candidateOperation, 'responses');
    for (const [status, baselineResponse] of Object.entries(
      baselineResponses,
    )) {
      if (!(status in candidateResponses)) {
        errors.push(`${location}.responses.${status}: 已删除既有响应状态`);
        continue;
      }
      errors.push(
        ...responseContentErrors(
          `${location}.responses.${status}`,
          baselineResponse,
          candidateResponses[status],
        ),
      );
    }
  }
  return errors;
}

/** Reports structural compatibility failures between one baseline and candidate document. */
export function findOpenApiCompatibilityErrors(
  baseline: unknown,
  candidate: unknown,
): string[] {
  if (!isRecord(baseline) || !isRecord(candidate)) {
    return ['document: OpenAPI 文档必须是 JSON object'];
  }
  const errors: string[] = [];
  if (!jsonEquals(baseline.security, candidate.security)) {
    errors.push('security: 已改变全局安全要求');
  }
  const baselinePaths = recordProperty(baseline, 'paths');
  const candidatePaths = recordProperty(candidate, 'paths');
  for (const [path, baselinePath] of Object.entries(baselinePaths)) {
    const candidatePath = candidatePaths[path];
    if (!isRecord(candidatePath)) {
      errors.push(`paths.${path}: 已删除既有路径`);
      continue;
    }
    if (isRecord(baselinePath)) {
      errors.push(...operationErrors(path, baselinePath, candidatePath));
    }
  }
  errors.push(
    ...componentSchemaErrors(baseline, candidate),
    ...securitySchemeErrors(baseline, candidate),
  );
  return errors;
}

/** Parses one artifact and attaches its source to malformed JSON errors. */
function parseArtifact(content: string, source: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch (error: unknown) {
    throw new Error(
      `${source} 不是有效 JSON：${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/** Reads every immutable supported baseline from the explicit v1 directory. */
async function readSupportedArtifacts(
  baselinesDirectory: string,
): Promise<SupportedArtifact[]> {
  let names: string[];
  try {
    names = (await readdir(baselinesDirectory, { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.isFile() && /^\d+\.\d+\.\d+\.openapi\.json$/.test(entry.name),
      )
      .map((entry) => entry.name)
      .sort();
  } catch (error: unknown) {
    const code = isRecord(error) ? error['code'] : undefined;
    if (code === 'ENOENT') {
      throw new Error(
        `未找到受支持的 OpenAPI v1 基线目录：${baselinesDirectory}`,
        { cause: error },
      );
    }
    throw error;
  }
  if (names.length === 0) {
    throw new Error(
      `未找到受支持的 OpenAPI v1 基线：${baselinesDirectory} 中必须提交至少一个 <semver>.openapi.json`,
    );
  }
  return Promise.all(
    names.map(async (name) => ({
      source: name,
      document: parseArtifact(
        await readFile(resolve(baselinesDirectory, name), 'utf8'),
        name,
      ),
    })),
  );
}

/** Checks the working-tree artifact against every explicit supported v1 baseline. */
export async function runOpenApiCompatibilityCommand(
  argumentsFromCli: readonly string[],
  options: CompatibilityCommandOptions = {
    artifactPath: ARTIFACT_PATH,
    baselinesDirectory: BASELINES_DIRECTORY,
    stderr: process.stderr,
    stdout: process.stdout,
  },
): Promise<number> {
  if (argumentsFromCli.length > 0) {
    options.stderr.write('用法：check-openapi-compatibility\n');
    return 64;
  }
  try {
    const candidate = parseArtifact(
      await readFile(options.artifactPath, 'utf8'),
      options.artifactPath,
    );
    const baselines = await readSupportedArtifacts(options.baselinesDirectory);
    const failures = baselines.flatMap((baseline) =>
      findOpenApiCompatibilityErrors(baseline.document, candidate).map(
        (error) => `${baseline.source} ${error}`,
      ),
    );
    if (failures.length > 0) {
      options.stderr.write(
        `OpenAPI v1 compatibility check failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}\n`,
      );
      return 1;
    }
    options.stdout.write(
      `OpenAPI v1 compatibility check passed (${baselines.length} 个受支持基线)\n`,
    );
    return 0;
  } catch (error: unknown) {
    options.stderr.write(
      `错误：${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await runOpenApiCompatibilityCommand(
    process.argv.slice(2),
  );
}
