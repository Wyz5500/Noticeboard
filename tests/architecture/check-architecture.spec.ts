/** Verifies architecture rules through the real checker process and controlled source fixtures. */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = process.cwd();
const CHECKER = resolve(PROJECT_ROOT, 'scripts/check-architecture.ts');
const TSX_LOADER = resolve(PROJECT_ROOT, 'node_modules/tsx/dist/loader.mjs');

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
