/** Verifies architecture rules through the real checker process and controlled source fixtures. */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = process.cwd();
const CHECKER = resolve(PROJECT_ROOT, 'scripts/check-architecture.ts');
const TSX_LOADER = fileURLToPath(import.meta.resolve('tsx'));

interface CheckerResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the production checker with one fixture acting as its project root. */
function runChecker(fixture: string): CheckerResult {
  const fixtureRoot = resolve(
    PROJECT_ROOT,
    'tests/architecture/fixtures',
    fixture,
  );
  const result = spawnSync(
    process.execPath,
    ['--import', TSX_LOADER, CHECKER],
    {
      cwd: fixtureRoot,
      encoding: 'utf8',
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe('feature boundary architecture rule', () => {
  /** Rejects every private layer when a different, generically named Feature imports it. */
  it('rejects cross-feature imports of private presentation, infrastructure, and application code', () => {
    const result = runChecker('private-imports');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[feature-private-import]');
    expect(result.stderr).toContain(
      'feature-a/presentation/controller.ts -> apps/api/src/feature-b/presentation/controller.ts',
    );
    expect(result.stderr).toContain(
      'feature-a/infrastructure/adapter.ts -> apps/api/src/feature-b/infrastructure/adapter.ts',
    );
    expect(result.stderr).toContain(
      'feature-a/application/use-case.ts -> apps/api/src/feature-b/application/internal-use-case.ts',
    );
  });

  /** Keeps persistence registration entry points exclusive to the API Composition Root. */
  it('rejects a Feature import of another Feature composition entry', () => {
    const result = runChecker('feature-composition-import');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[feature-composition-import]');
    expect(result.stderr).toContain(
      'apps/api/src/feature-a/infrastructure/adapter.ts -> apps/api/src/feature-b/public/composition/persistence.ts',
    );
  });

  /** Prevents shared common code from depending back on any Feature API or implementation. */
  it('rejects common imports of Feature code', () => {
    const result = runChecker('common-feature-import');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[common-feature-import]');
    expect(result.stderr).toContain(
      'apps/api/src/common/application/shared.ts -> apps/api/src/feature-b/public/contract.ts',
    );
  });

  /** Stops public barrels from making private implementation reachable indirectly. */
  it('rejects re-exporting Feature internals from public code', () => {
    const result = runChecker('public-re-export');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[public-internal-re-export]');
    expect(result.stderr).toContain(
      'apps/api/src/feature-b/public/index.ts -> apps/api/src/feature-b/application/internal-use-case.ts',
    );
  });

  /** Allows public contracts, same-Feature layer direction, common dependencies, and root composition. */
  it('allows the intended Feature and Composition Root dependency paths', () => {
    const result = runChecker('allowed-boundaries');

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('architecture checks passed');
  });

  /** Preserves the pre-existing rule that Domain cannot depend on Application. */
  it('continues to reject reverse layer dependencies inside one Feature', () => {
    const result = runChecker('layer-violation');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'domain cannot depend on application (apps/api/src/feature-a/application/use-case.ts)',
    );
  });

  /** Limits Feature composition entries to files directly owned by the API Composition Root. */
  it('rejects composition entry imports from nested top-level layer code', () => {
    const result = runChecker('non-root-composition-import');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[composition-root-only-import]');
    expect(result.stderr).toContain(
      'apps/api/src/presentation/controller.ts -> apps/api/src/feature-b/public/composition/persistence.ts',
    );
  });

  /** Requires even direct Composition Root code to use a Feature's declared entry points. */
  it('rejects direct Composition Root imports of private Feature implementation', () => {
    const result = runChecker('root-private-import');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[composition-private-feature-import]');
    expect(result.stderr).toContain(
      'apps/api/src/app.module.ts -> apps/api/src/feature-b/infrastructure/adapter.ts',
    );
  });
});

/** Runs client edges against complete, isolated API/Web/client fixture roots. */
function runClientChecker(changes: Record<string, string>): CheckerResult {
  const root = mkdtempSync(resolve(tmpdir(), 'noticeboard-boundaries-'));
  try {
    cpSync(
      resolve(PROJECT_ROOT, 'tests/architecture/fixtures/client-boundaries'),
      root,
      { recursive: true },
    );
    for (const [path, source] of Object.entries(changes)) {
      const target = resolve(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, source);
    }
    const result = spawnSync(
      process.execPath,
      ['--import', TSX_LOADER, CHECKER],
      { cwd: root, encoding: 'utf8' },
    );
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const CLIENT = 'apps/cli/src/';
const SDK = `${CLIENT}sdk/`;

describe('client architecture boundaries', () => {
  /** Permits only the public SDK entry to be consumed by the CLI. */
  it('allows the artifact transport to SDK to CLI direction', () => {
    expect(runClientChecker({}).status).toBe(0);
  });

  /** Blocks cross-process imports regardless of whether values or types are requested. */
  it.each([
    ['apps/api/src/root.ts', "import '../../cli/src/main.js';"],
    ['apps/web/src/root.ts', "import '../../cli/src/sdk/index.js';"],
    ['apps/web/src/root.ts', "import '../../cli/src/main.js';"],
    [`${CLIENT}main.ts`, "import '../../api/src/root.js';"],
    [`${CLIENT}main.ts`, "import '../../web/src/root.js';"],
    [`${CLIENT}main.ts`, "import './sdk/internal/resource.js';"],
    [
      `${CLIENT}main.ts`,
      "export type { Wire } from './sdk/internal/generated/types.js';",
    ],
    [`${SDK}internal/resource.ts`, "import '../../../../api/src/root.js';"],
    [`${SDK}internal/resource.ts`, "import '../../../../web/src/root.js';"],
    [`${SDK}internal/resource.ts`, "import '../../main.js';"],
    [`${SDK}internal/generated/types.ts`, "import '../resource.js';"],
    [
      `${SDK}internal/generated/types.ts`,
      "import '../../../../../api/src/root.js';",
    ],
    [
      `${CLIENT}main.ts`,
      "import type { Wire } from './sdk/internal/generated/types.js';",
    ],
    [
      `${CLIENT}main.ts`,
      "import { type Wire } from './sdk/internal/generated/types.js';",
    ],
    [
      `${CLIENT}main.ts`,
      "export { type Wire } from './sdk/internal/generated/types.js';",
    ],
    [`${CLIENT}main.ts`, "void import('./sdk/internal/generated/types.js');"],
    [
      `${CLIENT}main.ts`,
      "type Wire = import('./sdk/internal/generated/types.js').Wire;",
    ],
  ])('rejects forbidden edge from %s: %s', (path, source) => {
    const result = runClientChecker({ [path]: source });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[client-boundary]');
  });

  /** Prevents generated symbols from escaping directly or through a handwritten barrel. */
  it.each([
    {
      [`${SDK}index.ts`]:
        "export type { Wire } from './internal/generated/types.js';",
    },
    {
      [`${SDK}index.ts`]: "export type { Wire } from './internal/barrel.js';",
      [`${SDK}internal/barrel.ts`]:
        "export type { Wire } from './generated/types.js';",
    },
    {
      [`${SDK}index.ts`]: "export { Wire } from './internal/barrel.js';",
      [`${SDK}internal/barrel.ts`]:
        "import type { Wire } from './generated/types.js'; export type { Wire };",
    },
  ])(
    'rejects generated symbol exposure through the SDK public entry',
    (changes) => {
      const result = runClientChecker(changes);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('[sdk-generated-export]');
    },
  );

  /** Type-only edges enforce boundaries but must not introduce runtime cycles. */
  it.each([
    "import type { B } from './b.js'; export type A = B | string;",
    "import { type B } from './b.js'; export type A = B | string;",
    "export { type B as A } from './b.js';",
    "export type A = import('./b.js').B;",
  ])('excludes erased imports from runtime cycles: %s', (source) => {
    const result = runClientChecker({
      [`${SDK}internal/a.ts`]: source,
      [`${SDK}internal/b.ts`]: "import './a.js'; export type B = number;",
    });
    expect(result.status).toBe(0);
  });

  /** Keeps generated runtime cycles subject to the same gate as handwritten code. */
  it('rejects runtime cycles inside generated transport', () => {
    const result = runClientChecker({
      [`${SDK}internal/generated/a.ts`]: "import './b.js';",
      [`${SDK}internal/generated/b.ts`]: "import './a.js';",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cyclic dependency');
  });
});
