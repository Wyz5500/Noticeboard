/** Enforces dependency direction, framework isolation, and acyclic imports across handwritten TypeScript modules. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SOURCE_ROOTS = [
  join(ROOT, 'apps', 'api', 'src'),
  join(ROOT, 'apps', 'web', 'src'),
];
const LAYERS = [
  'domain',
  'application',
  'presentation',
  'infrastructure',
] as const;
type Layer = (typeof LAYERS)[number];

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

/** Reads static import and export edges using the TypeScript syntax tree. */
function importsOf(
  path: string,
): Array<{ specifier: string; target: string | null; typeOnly: boolean }> {
  const text = readFileSync(path, 'utf8');
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const imports: Array<{
    specifier: string;
    target: string | null;
    typeOnly: boolean;
  }> = [];
  for (const statement of file.statements) {
    if (
      (ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier
    ) {
      const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
      const typeOnly = ts.isImportDeclaration(statement)
        ? Boolean(statement.importClause?.isTypeOnly)
        : statement.isTypeOnly;
      imports.push({
        specifier,
        target: resolveLocalImport(path, specifier),
        typeOnly,
      });
    }
  }
  return imports;
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
    const text = readFileSync(file, 'utf8');
    if (/\b(?:GenericRepository|BaseRepository|BaseService)\b/.test(text)) {
      errors.push(
        `${local}: generic repository/service abstractions are forbidden`,
      );
    }
    for (const imported of importsOf(file)) {
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
  const files = SOURCE_ROOTS.flatMap(sourceFiles);
  const known = new Set(files);
  const graph = new Map(
    files.map((file) => [
      file,
      importsOf(file).flatMap(({ target, typeOnly }) =>
        target && known.has(target) && !typeOnly ? [target] : [],
      ),
    ]),
  );
  const errors = checkBoundaries(files, graph);
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
