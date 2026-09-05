/** Orval client generator for v1 JSON operations with case-insensitive native Fetch headers. */
import type {
  ClientBuilder,
  GeneratorVerbOptions,
  OutputClientFunc,
} from 'orval';

/** Rejects wire shapes outside this JSON transport's supported subset instead of silently misgenerating them. */
function assertSupportedOperation(operation: GeneratorVerbOptions): void {
  const responses = [
    ...operation.response.types.success,
    ...operation.response.types.errors,
  ];
  if (
    operation.queryParams ||
    operation.headers ||
    operation.mutator ||
    operation.props.some(
      (prop) => prop.type !== 'param' && prop.type !== 'body',
    ) ||
    operation.params.some((param) => !param.required || param.allowReserved) ||
    (operation.body.definition &&
      operation.body.contentType !== 'application/json') ||
    responses.some(
      (response) =>
        !/^\d{3}$/.test(response.key) ||
        (response.contentType && response.contentType !== 'application/json'),
    ) ||
    !responses.length
  ) {
    throw new Error(
      `不支持的 Fetch wire 形态：${operation.operationId}；请扩展生成器与合同测试`,
    );
  }
}

/** Generates each operation directly from Orval metadata, without editing native generator output. */
const generateFetchOperation: ClientBuilder = (operation) => {
  assertSupportedOperation(operation);
  const { operationName, body, props, params, response } = operation;
  const responseName = `${operation.typeName}Response`;
  const variants = [...response.types.success, ...response.types.errors]
    .map(
      (variant) =>
        `{ status: ${variant.key}; data: ${variant.value || 'unknown'}; headers: Headers }`,
    )
    .join(' | ');
  const argumentsList = [
    ...props.map((prop) => prop.implementation),
    'options?: RequestInit',
    'fetchFn?: typeof globalThis.fetch',
  ].join(', ');
  // The route's interpolation expressions and parameter names are supplied by Orval's parser.
  const routeParts = operation.route.split(/(\$\{[^}]+\})/).map((part) => {
    const match = /^\$\{([^}]+)\}$/.exec(part);
    if (!match) return JSON.stringify(part);
    if (!params.some((param) => param.name === match[1]))
      throw new Error(`无法解析路径参数：${operation.operationId}`);
    return `encodeURIComponent(String(${match[1]}))`;
  });
  const bodyOptions = body.definition
    ? `body: JSON.stringify(${body.implementation}),`
    : '';
  const defaultHeader = body.definition
    ? `if (!headers.has('content-type')) headers.set('content-type', ${JSON.stringify(body.contentType)});`
    : '';
  return {
    imports: [
      ...response.imports,
      ...body.imports,
      ...params.flatMap((param) => param.imports),
    ],
    implementation: `export type ${responseName} = ${variants};

export const ${operationName} = async (${argumentsList}): Promise<${responseName}> => {
  const headers = new Headers(options?.headers);
  ${defaultHeader}
  const response = await (fetchFn ?? fetch)(${routeParts.join(' + ')}, {
    ...options,
    method: ${JSON.stringify(operation.verb.toUpperCase())},
    headers,
    ${bodyOptions}
  });
  const text = [204, 205, 304].includes(response.status) ? '' : await response.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  return { data, status: response.status, headers: response.headers } as ${responseName};
};
`,
  };
};

/** Uses Orval's supported client extension while leaving schema generation and file emission to Orval. */
export const createFetchClient: OutputClientFunc = () => ({
  client: generateFetchOperation,
});
