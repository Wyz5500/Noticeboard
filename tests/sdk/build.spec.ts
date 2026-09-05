/** Verifies the independently built SDK and its transitive public declaration boundary. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { afterAll, beforeAll, expect, it } from 'vitest';

let output: string;

/** Builds in an isolated output directory so the test also works before the root build. */
beforeAll(() => {
  output = mkdtempSync(join(tmpdir(), 'noticeboard-sdk-'));
  execFileSync(
    process.execPath,
    [
      'node_modules/typescript/bin/tsc',
      '-p',
      'apps/cli/tsconfig.sdk.build.json',
      '--outDir',
      output,
    ],
    { stdio: 'pipe' },
  );
});

/** Removes only this test's temporary compiler output, including after failed assertions. */
afterAll(() => {
  if (output) rmSync(output, { recursive: true, force: true });
});

/** A plain Node consumer must execute emitted JavaScript without tsx, Vitest or server dependencies. */
it('consumes the emitted ESM public entry in plain Node', () => {
  const result = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      'const sdk = await import(process.argv[1]); const client = sdk.createNoticeboardClient({baseUrl:"https://example.test", fetch:async () => Response.json([])}); process.stdout.write(JSON.stringify({exports:Object.keys(sdk).sort(), data:await client.tasks.list()}));',
      pathToFileURL(join(output, 'index.js')).href,
    ],
    { encoding: 'utf8' },
  );
  expect(JSON.parse(result)).toEqual({
    exports: [
      'NoticeboardApiError',
      'NoticeboardNetworkError',
      'NoticeboardProtocolError',
      'createNoticeboardClient',
    ],
    data: [],
  });
});

/** TypeScript resolves all reachable declarations, catching generated types hidden behind handwritten aliases. */
it('keeps generated and server modules out of the transitive public declaration graph', () => {
  const program = ts.createProgram([join(output, 'index.d.ts')], {
    strict: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2023,
    types: [],
  });
  expect(
    ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      ),
  ).toEqual([]);
  const reachable = program
    .getSourceFiles()
    .filter((source) => !program.isSourceFileDefaultLibrary(source));
  expect(reachable.length).toBeGreaterThan(1);
  for (const source of reachable) {
    expect(resolve(source.fileName).startsWith(`${output}/`)).toBe(true);
    expect(source.fileName).not.toMatch(/generated|apps\/api|apps\/web/);
  }
});
