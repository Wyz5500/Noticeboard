/** Enforces dependency direction, framework isolation, and acyclic imports across server, Web, and internal client TypeScript modules. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const API_SOURCE_ROOT = join(ROOT, 'apps', 'api', 'src');
const CLIENT_SOURCE_ROOT = join(ROOT, 'apps', 'cli', 'src');
const SDK_ROOT = join(CLIENT_SOURCE_ROOT, 'sdk');
const SDK_PUBLIC_ENTRY = join(SDK_ROOT, 'index.ts');
const SOURCE_ROOTS = [API_SOURCE_ROOT, join(ROOT, 'apps', 'web', 'src')];
const LAYERS = [
  'domain',
  'application',
  'presentation',
  'infrastructure',
] as const;
type Layer = (typeof LAYERS)[number];

interface FeatureLocation {
  name: string;
  segments: readonly string[];
}

/** Recursively discovers production TypeScript sources while excluding test files. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [path]
      : [];
  });
}

/** Identifies a four-layer directory segment when the module has one. */
function layerOf(path: string): Layer | null {
  return LAYERS.find((layer) => path.split('/').includes(layer)) ?? null;
}

/** Identifies API Feature ownership without enumerating current Feature names. */
function featureOf(path: string): FeatureLocation | null {
  const local = relative(API_SOURCE_ROOT, path);
  if (local.startsWith('..') || local === '') return null;
  const segments = local.split(/[\\/]/);
  const first = segments[0];
  if (
    segments.length < 2 ||
    !first ||
    first === 'common' ||
    LAYERS.includes(first as Layer)
  )
    return null;
  return { name: first, segments };
}

/** Returns whether an API source belongs to the Feature-independent common area. */
function isCommon(path: string): boolean {
  const local = relative(API_SOURCE_ROOT, path);
  return !local.startsWith('..') && local.split(/[\\/]/)[0] === 'common';
}

/** Returns whether a source file sits directly in the API Composition Root. */
function isCompositionRoot(path: string): boolean {
  const local = relative(API_SOURCE_ROOT, path);
  return !local.startsWith('..') && !/[\\/]/.test(local);
}

/** Resolves a relative ESM specifier back to the checked TypeScript source. */
function resolveLocalImport(
  importer: string,
  specifier: string,
): string | null {
  if (!specifier.startsWith('.')) return null;
  const candidate = resolve(
    dirname(importer),
    specifier.replace(/\.js$/, '.ts'),
  );
  if (existsSync(candidate)) return candidate;
  const indexCandidate = join(candidate, 'index.ts');
  return existsSync(indexCandidate) ? indexCandidate : null;
}

interface ImportEdge {
  specifier: string;
  target: string | null;
  typeOnly: boolean;
  reExport: boolean;
}

/** Recognizes declaration-wide and inline type specifiers without erasing mixed imports. */
function isTypeOnly(
  statement: ts.ImportDeclaration | ts.ExportDeclaration,
): boolean {
  if (ts.isExportDeclaration(statement)) {
    return (
      statement.isTypeOnly ||
      Boolean(
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.length &&
        statement.exportClause.elements.every((element) => element.isTypeOnly),
      )
    );
  }
  const clause = statement.importClause;
  return Boolean(
    clause?.isTypeOnly ||
    (clause &&
      !clause.name &&
      clause.namedBindings &&
      ts.isNamedImports(clause.namedBindings) &&
      clause.namedBindings.elements.length &&
      clause.namedBindings.elements.every((element) => element.isTypeOnly)),
  );
}

/** Reads static, dynamic, and import-type edges; computed client imports fail closed. */
function importsOf(path: string): ImportEdge[] {
  const file = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const imports: ImportEdge[] = [];
  const add = (
    specifier: string,
    typeOnly: boolean,
    reExport = false,
  ): void => {
    imports.push({
      specifier,
      target: resolveLocalImport(path, specifier),
      typeOnly,
      reExport,
    });
  };
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      add(
        node.moduleSpecifier.text,
        isTypeOnly(node),
        ts.isExportDeclaration(node),
      );
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      add(node.argument.literal.text, true);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      const argument = node.arguments[0];
      add(
        argument && ts.isStringLiteralLike(argument)
          ? argument.text
          : '<computed-import>',
        false,
      );
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      add(node.moduleReference.expression.text, node.isTypeOnly);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return imports;
}

type SourceArea =
  'generated' | 'sdk-public' | 'sdk' | 'cli' | 'web' | 'api' | 'outside';

/** Classifies by complete path segments, with narrow client contracts taking precedence. */
function areaOf(path: string): SourceArea {
  const local = relative(ROOT, path).split(/[\\/]/).join('/');
  if (local.startsWith('apps/cli/src/sdk/internal/generated/'))
    return 'generated';
  if (local === 'apps/cli/src/sdk/index.ts') return 'sdk-public';
  if (local.startsWith('apps/cli/src/sdk/')) return 'sdk';
  if (local.startsWith('apps/cli/src/')) return 'cli';
  if (local.startsWith('apps/web/src/')) return 'web';
  if (local.startsWith('apps/api/src/')) return 'api';
  return 'outside';
}

/** Enforces process and SDK boundaries for both erased and runtime dependencies. */
function clientEdgeAllowed(source: SourceArea, target: SourceArea): boolean {
  const allowed: Record<SourceArea, readonly SourceArea[]> = {
    generated: ['generated'],
    'sdk-public': ['sdk-public', 'sdk'],
    sdk: ['sdk', 'generated', 'sdk-public'],
    cli: ['cli', 'sdk-public'],
    web: ['web'],
    api: ['api'],
    outside: [],
  };
  return allowed[source].includes(target);
}

/** Resolves exported aliases through barrels so generated symbols cannot become SDK exports. */
function generatedExportErrors(files: readonly string[]): string[] {
  if (!files.includes(SDK_PUBLIC_ENTRY)) return [];
  const program = ts.createProgram([...files], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noLib: true,
    types: [],
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(SDK_PUBLIC_ENTRY);
  const symbol = source && checker.getSymbolAtLocation(source);
  if (!symbol) return [];
  return checker.getExportsOfModule(symbol).flatMap((exported) => {
    const original =
      exported.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exported)
        : exported;
    return original.declarations?.some(
      (declaration) =>
        areaOf(declaration.getSourceFile().fileName) === 'generated',
    )
      ? [
          `[sdk-generated-export] ${relative(ROOT, SDK_PUBLIC_ENTRY)}: generated symbol ${exported.name} cannot be exported through SDK public entry`,
        ]
      : [];
  });
}

/** Returns dependency layers that a source layer is permitted to reference. */
function allowedLayers(layer: Layer): ReadonlySet<Layer> {
  const rules: Record<Layer, readonly Layer[]> = {
    domain: ['domain'],
    application: ['domain', 'application'],
    presentation: ['domain', 'application', 'presentation'],
    infrastructure: ['domain', 'application', 'infrastructure'],
  };
  return new Set(rules[layer]);
}

/** Reports forbidden dependencies and generic business abstractions with actionable paths. */
function checkBoundaries(
  files: readonly string[],
  graph: ReadonlyMap<string, readonly string[]>,
): string[] {
  const errors: string[] = [];
  for (const file of files) {
    const local = relative(ROOT, file);
    const sourceLayer = layerOf(file);
    const sourceFeature = featureOf(file);
    const sourceIsCommon = isCommon(file);
    const text = readFileSync(file, 'utf8');
    if (/\b(?:GenericRepository|BaseRepository|BaseService)\b/.test(text)) {
      errors.push(
        `${local}: generic repository/service abstractions are forbidden`,
      );
    }
    for (const imported of importsOf(file)) {
      const sourceArea = areaOf(file);
      const targetArea = imported.target ? areaOf(imported.target) : 'outside';
      const clientSource = ['generated', 'sdk-public', 'sdk', 'cli'].includes(
        sourceArea,
      );
      if (
        (imported.target && !clientEdgeAllowed(sourceArea, targetArea)) ||
        (sourceArea === 'generated' &&
          (!imported.target || targetArea !== 'generated')) ||
        (clientSource &&
          (imported.specifier === '<computed-import>' ||
            /^(?:@nestjs(?:\/|$)|typeorm(?:\/|$)|pg(?:\/|$)|fastify(?:\/|$)|@fastify\/)/.test(
              imported.specifier,
            )))
      ) {
        errors.push(
          `[client-boundary] ${local} -> ${imported.specifier}: ${sourceArea} cannot depend on ${targetArea}`,
        );
      }
      if (sourceArea === 'sdk-public' && targetArea === 'generated') {
        errors.push(
          `[sdk-generated-export] ${local}: SDK public entry cannot expose generated transport`,
        );
      }
      const targetFeature = imported.target ? featureOf(imported.target) : null;
      if (sourceIsCommon && targetFeature) {
        errors.push(
          `[common-feature-import] ${local} -> ${relative(ROOT, imported.target!)}: common code cannot depend on a Feature`,
        );
      }
      if (
        isCompositionRoot(file) &&
        targetFeature &&
        targetFeature.segments[1] !== 'public'
      ) {
        errors.push(
          `[composition-private-feature-import] ${local} -> ${relative(ROOT, imported.target!)}: API Composition Root must use declared Feature entry points`,
        );
      }
      if (
        !sourceFeature &&
        !sourceIsCommon &&
        !isCompositionRoot(file) &&
        targetFeature?.segments[1] === 'public' &&
        targetFeature.segments[2] === 'composition'
      ) {
        errors.push(
          `[composition-root-only-import] ${local} -> ${relative(ROOT, imported.target!)}: only direct API Composition Root files can import Feature composition entries`,
        );
      }
      if (
        imported.reExport &&
        sourceFeature?.segments[1] === 'public' &&
        targetFeature?.name === sourceFeature.name &&
        targetFeature.segments[1] !== 'public'
      ) {
        errors.push(
          `[public-internal-re-export] ${local} -> ${relative(ROOT, imported.target!)}: public code cannot re-export Feature internals`,
        );
      }
      if (
        sourceFeature &&
        targetFeature?.segments[1] === 'public' &&
        targetFeature.segments[2] === 'composition'
      ) {
        errors.push(
          `[feature-composition-import] ${local} -> ${relative(ROOT, imported.target!)}: Feature code cannot import root-only Feature composition entries`,
        );
      }
      if (
        sourceFeature &&
        targetFeature &&
        sourceFeature.name !== targetFeature.name &&
        targetFeature.segments[1] !== 'public'
      ) {
        errors.push(
          `[feature-private-import] ${local} -> ${relative(ROOT, imported.target!)}: Feature ${sourceFeature.name} can only import Feature ${targetFeature.name} through its public API`,
        );
      }
      if (
        sourceLayer === 'domain' &&
        /^(?:@nestjs|typeorm|fastify|@fastify|pg$)/.test(imported.specifier)
      ) {
        errors.push(
          `${local}: domain cannot import framework or persistence package ${imported.specifier}`,
        );
      }
      if (
        sourceLayer === 'application' &&
        /^(?:typeorm|fastify|@fastify|pg$)/.test(imported.specifier)
      ) {
        errors.push(
          `${local}: application cannot import transport or persistence package ${imported.specifier}`,
        );
      }
      if (!sourceLayer || !imported.target) continue;
      const targetLayer = layerOf(imported.target);
      if (targetLayer && !allowedLayers(sourceLayer).has(targetLayer)) {
        errors.push(
          `${local}: ${sourceLayer} cannot depend on ${targetLayer} (${relative(ROOT, imported.target)})`,
        );
      }
    }
    if (
      (sourceLayer === 'domain' || sourceLayer === 'application') &&
      /\b(?:EntityManager|QueryRunner|FastifyRequest)\b/.test(text)
    ) {
      errors.push(
        `${local}: core layers cannot mention infrastructure or HTTP runtime types`,
      );
    }
    if (
      (sourceLayer === 'domain' || sourceLayer === 'application') &&
      /\b(?:SELECT\s+[\s\S]{1,80}\s+FROM|INSERT\s+INTO|UPDATE\s+[a-z_]\w*\s+SET|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE)\b/i.test(
        text,
      )
    ) {
      errors.push(`${local}: core layers cannot contain direct SQL`);
    }
    void graph;
  }
  return errors;
}

/** Detects the first import cycle with depth-first traversal. */
function findCycle(
  graph: ReadonlyMap<string, readonly string[]>,
): string[] | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const visit = (file: string): string[] | null => {
    if (visiting.has(file)) return [...stack.slice(stack.indexOf(file)), file];
    if (visited.has(file)) return null;
    visiting.add(file);
    stack.push(file);
    for (const target of graph.get(file) ?? []) {
      const cycle = visit(target);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(file);
    visited.add(file);
    return null;
  };
  for (const file of graph.keys()) {
    const cycle = visit(file);
    if (cycle) return cycle;
  }
  return null;
}

/** Builds the local import graph, runs every rule, and exits non-zero on violations. */
function main(): void {
  const files = [
    ...SOURCE_ROOTS.flatMap(sourceFiles),
    ...(existsSync(CLIENT_SOURCE_ROOT) ? sourceFiles(CLIENT_SOURCE_ROOT) : []),
  ];
  const known = new Set(files);
  const graph = new Map(
    files.map((file) => [
      file,
      importsOf(file).flatMap(({ target, typeOnly }) =>
        target && known.has(target) && !typeOnly ? [target] : [],
      ),
    ]),
  );
  const errors = [
    ...checkBoundaries(files, graph),
    ...generatedExportErrors(files),
  ];
  const cycle = findCycle(graph);
  if (cycle)
    errors.push(
      `cyclic dependency: ${cycle.map((file) => relative(ROOT, file)).join(' -> ')}`,
    );
  if (errors.length) {
    process.stderr.write(`${errors.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `architecture checks passed (${files.length} source files)\n`,
  );
}

main();
