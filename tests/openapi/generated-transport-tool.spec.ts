/** Exercises complete generated-tree drift and replacement through real filesystem and CLI operations. */
import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  utimes,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import {
  compareGeneratedTrees,
  readGeneratedTree,
  replaceGeneratedTree,
} from '../../scripts/generated-transport.js';

const ROOT = process.cwd();
const SCRIPT = resolve(ROOT, 'scripts/generated-transport.ts');
const LOADER = fileURLToPath(import.meta.resolve('tsx'));
const GENERATED = 'apps/cli/src/sdk/internal/generated';
const roots: string[] = [];

/** Allocates a disposable repository tree that never writes the real tracked artifacts. */
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'noticeboard-codegen-test-'));
  roots.push(root);
  return root;
}

/** Writes exact fixture bytes, preserving nested path shape. */
async function writeTree(
  root: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text);
  }
}

/** Invokes the real command with fixed input/output paths under a disposable root. */
function command(root: string, ...args: string[]) {
  return spawnSync(process.execPath, ['--import', LOADER, SCRIPT, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

/** Removes only test-owned temporary roots even when an assertion fails. */
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('generated tree comparison', () => {
  /** Byte differences and path membership must each produce stable, actionable diagnostics. */
  it('distinguishes missing, changed and stale nested files in sorted POSIX order', async () => {
    const root = await temporaryRoot();
    const tracked = join(root, 'tracked');
    const candidate = join(root, 'candidate');
    await writeTree(tracked, {
      'z/stale.ts': 'stale',
      'b/change.ts': 'old',
      'same.ts': 'same',
    });
    await writeTree(candidate, {
      'same.ts': 'same',
      'b/change.ts': 'new',
      'a/missing.ts': 'missing',
    });
    expect(
      compareGeneratedTrees(
        await readGeneratedTree(tracked),
        await readGeneratedTree(candidate),
      ),
    ).toEqual([
      'missing: a/missing.ts',
      'changed: b/change.ts',
      'stale: z/stale.ts',
    ]);
  });

  /** Filesystem enumeration and timestamps must not influence deterministic comparison. */
  it('compares raw bytes and stable relative paths without timestamps', async () => {
    const root = await temporaryRoot();
    await writeTree(join(root, 'left'), { 'z.ts': 'z', 'a/b.ts': 'b' });
    await writeTree(join(root, 'right'), { 'a/b.ts': 'b', 'z.ts': 'z' });
    await utimes(join(root, 'left/z.ts'), 0, 0);
    const left = await readGeneratedTree(join(root, 'left'));
    expect([...left.keys()]).toEqual(['a/b.ts', 'z.ts']);
    expect(
      compareGeneratedTrees(left, await readGeneratedTree(join(root, 'right'))),
    ).toEqual([]);
    expect(await readGeneratedTree(join(root, 'absent'))).toEqual(new Map());
  });

  /** Staged replacement must remove stale files, not merge them into the next generation. */
  it('replaces the entire tree and removes its backup after success', async () => {
    const root = await temporaryRoot();
    await writeTree(join(root, 'tracked'), { 'old.ts': 'old' });
    await writeTree(join(root, 'staged'), { 'nested/new.ts': 'new' });
    await replaceGeneratedTree(join(root, 'staged'), join(root, 'tracked'));
    expect(
      [...(await readGeneratedTree(join(root, 'tracked')))].map(
        ([path, bytes]) => [path, bytes.toString()],
      ),
    ).toEqual([['nested/new.ts', 'new']]);
    expect(await readdir(root)).toEqual(['tracked']);
  });

  /** A failed rename after moving the old tree must restore that tree and clean its backup. */
  it('restores the old tree when installing the staged directory fails', async () => {
    const root = await temporaryRoot();
    await writeTree(join(root, 'tracked'), { 'old.ts': 'old' });
    await expect(
      replaceGeneratedTree(join(root, 'missing-stage'), join(root, 'tracked')),
    ).rejects.toThrow();
    expect((await readFile(join(root, 'tracked/old.ts'))).toString()).toBe(
      'old',
    );
    expect(await readdir(root)).toEqual(['tracked']);
  });
});

describe('generated transport command', () => {
  /** A newly introduced query contract must fail generation until its serialization is explicitly supported. */
  it('fails closed on unsupported wire shapes without replacing the tracked tree', async () => {
    const root = await temporaryRoot();
    const artifact = JSON.parse(
      await readFile(join(ROOT, 'openapi/v1/noticeboard.openapi.json'), 'utf8'),
    ) as { paths: Record<string, Record<string, { parameters: unknown[] }>> };
    artifact.paths['/api/v1/tasks']!.get!.parameters.push({
      in: 'query',
      name: 'filter',
      schema: { type: 'string' },
    });
    await writeTree(root, {
      'openapi/v1/noticeboard.openapi.json': JSON.stringify(artifact),
      [`${GENERATED}/old.ts`]: 'old',
    });
    const result = command(root, 'generate');
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('不支持的 Fetch wire 形态');
    expect((await readFile(join(root, GENERATED, 'old.ts'))).toString()).toBe(
      'old',
    );
  });

  /** Usage errors must fail before attempting codegen or creating output directories. */
  it.each([
    { args: [] },
    { args: ['check', '--input', 'baseline.json'] },
    { args: ['unknown'] },
  ])('rejects unsupported arguments: %j', async ({ args }) => {
    const root = await temporaryRoot();
    const result = command(root, ...args);
    expect(result.status).toBe(64);
    expect(result.stderr).toContain('用法');
    expect(await readdir(root)).toEqual([]);
  });

  /** Invalid candidate input must not overwrite tracked output or leave staging directories. */
  it('preserves the old tree and cleans staging after codegen failure', async () => {
    const root = await temporaryRoot();
    await writeTree(root, {
      'openapi/v1/noticeboard.openapi.json': 'invalid json',
      [`${GENERATED}/old.ts`]: 'old',
    });
    const result = command(root, 'generate');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('client:generate');
    expect((await readFile(join(root, GENERATED, 'old.ts'))).toString()).toBe(
      'old',
    );
    expect(await readdir(join(root, dirname(GENERATED)))).toEqual([
      'generated',
    ]);
  });

  /** Independent temporary directories must generate identical bytes; check must never rewrite tracked files. */
  it('generates deterministically from only the candidate and reports drift without writing', async () => {
    const root = await temporaryRoot();
    await writeTree(root, {
      'openapi/v1/noticeboard.openapi.json': await readFile(
        join(ROOT, 'openapi/v1/noticeboard.openapi.json'),
        'utf8',
      ),
      'openapi/v1/baselines/1.0.0.openapi.json': 'not an input',
    });
    expect(command(root, 'generate').status).toBe(0);
    const tracked = join(root, GENERATED);
    const first = await readGeneratedTree(tracked);
    expect(command(root, 'generate').status).toBe(0);
    expect(
      compareGeneratedTrees(first, await readGeneratedTree(tracked)),
    ).toEqual([]);
    expect(command(root, 'check').status).toBe(0);
    await writeTree(tracked, {
      'transport.ts': 'changed',
      'nested/stale.ts': 'stale',
    });
    const before = await readGeneratedTree(tracked);
    const changed = command(root, 'check');
    expect(changed.status).toBe(1);
    expect(changed.stderr).toContain('changed: transport.ts');
    expect(changed.stderr).toContain('stale: nested/stale.ts');
    expect(
      compareGeneratedTrees(before, await readGeneratedTree(tracked)),
    ).toEqual([]);
    await rm(join(tracked, 'transport.ts'));
    const missing = command(root, 'check');
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('missing: transport.ts');
    expect(await readdir(join(root, dirname(GENERATED)))).toEqual([
      'generated',
    ]);
  }, 15000);

  /** Every generated dependency must resolve inside the generated tree, with no runtime package imports. */
  it('keeps generated sources self-contained and free of environment-specific paths', async () => {
    const tree = await readGeneratedTree(join(ROOT, GENERATED));
    expect(tree.size).toBeGreaterThan(0);
    for (const [path, bytes] of tree) {
      const text = bytes.toString();
      expect(text).not.toContain(ROOT);
      expect(text).not.toMatch(/(?:\/private\/|\/tmp\/|[A-Z]:\\)/);
      const source = ts.createSourceFile(
        path,
        text,
        ts.ScriptTarget.Latest,
        true,
      );
      const inspect = (node: ts.Node): void => {
        let specifier: string | undefined;
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        )
          specifier = node.moduleSpecifier.text;
        if (
          ts.isImportTypeNode(node) &&
          ts.isLiteralTypeNode(node.argument) &&
          ts.isStringLiteral(node.argument.literal)
        )
          specifier = node.argument.literal.text;
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) &&
              node.expression.text === 'require'))
        ) {
          expect(
            node.arguments[0] && ts.isStringLiteral(node.arguments[0]),
          ).toBe(true);
          specifier = (node.arguments[0] as ts.StringLiteral).text;
        }
        if (specifier) {
          expect(specifier.startsWith('.'), specifier).toBe(true);
          const target = resolve(
            dirname(path),
            specifier.replace(/\.js$/, '.ts'),
          );
          expect(
            [...tree.keys()].some((key) => resolve(key) === target),
            specifier,
          ).toBe(true);
        }
        ts.forEachChild(node, inspect);
      };
      inspect(source);
    }
  });
});
