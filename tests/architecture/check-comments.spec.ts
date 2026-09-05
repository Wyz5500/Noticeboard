/** Tests the precise generated-source exemption without hiding other handwritten code from comment checks. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

/** Only the actual internal transport subtree is exempt, even when other directories share its name. */
it('skips only the repository-relative generated transport subtree', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'noticeboard-comments-'));
  try {
    for (const path of [
      'apps/cli/src/sdk/internal/generated',
      'apps/api/src/generated',
      'scripts',
      'tests',
    ])
      mkdirSync(resolve(root, path), { recursive: true });
    for (const path of [
      'apps/cli/src/sdk/internal/generated/wire.ts',
      'apps/api/src/generated/manual.ts',
    ])
      writeFileSync(
        resolve(root, path),
        'export function missingDocs(): void {}',
      );
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        fileURLToPath(import.meta.resolve('tsx')),
        resolve('scripts/check-comments.ts'),
      ],
      { cwd: root, encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('apps/api/src/generated/manual.ts');
    expect(result.stderr).not.toContain(
      'apps/cli/src/sdk/internal/generated/wire.ts',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
