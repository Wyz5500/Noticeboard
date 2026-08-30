/** Verifies responsibility headers and meaningful API documentation on handwritten callable declarations. */
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const DIRECTORIES = ['apps', 'scripts', 'tests'];
const EXCLUDED = new Set([
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
]);

/** Recursively selects handwritten TypeScript and module JavaScript files. */
function codeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (EXCLUDED.has(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return codeFiles(path);
    return ['.ts', '.mts', '.mjs'].includes(extname(entry.name)) ? [path] : [];
  });
}

/** Determines whether a declaration has a leading TSDoc/JSDoc block. */
function hasDocumentation(node: ts.Node): boolean {
  return ts.getJSDocCommentsAndTags(node).length > 0;
}

/** Visits named callable declarations and reports any undocumented public design surface. */
function callableErrors(path: string, source: ts.SourceFile): string[] {
  const errors: string[] = [];
  const visit = (node: ts.Node): void => {
    const requiresDocumentation =
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node);
    if (requiresDocumentation && !hasDocumentation(node)) {
      const position = source.getLineAndCharacterOfPosition(
        node.getStart(source),
      );
      errors.push(
        `${relative(ROOT, path)}:${position.line + 1}: callable declaration requires TSDoc/JSDoc`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return errors;
}

/** Checks each selected file for a responsibility header and documented callable declarations. */
function main(): void {
  const files = DIRECTORIES.flatMap((directory) =>
    codeFiles(join(ROOT, directory)),
  );
  const errors: string[] = [];
  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    if (!text.trimStart().startsWith('/**'))
      errors.push(`${relative(ROOT, path)}: missing responsibility header`);
    const kind = path.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    const source = ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
      kind,
    );
    errors.push(...callableErrors(path, source));
  }
  if (errors.length) {
    process.stderr.write(`${errors.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `comment checks passed (${files.length} handwritten files)\n`,
  );
}

main();
