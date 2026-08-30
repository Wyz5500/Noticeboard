/** Verifies fixed user-facing copy stays free of English words. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { THEMES } from '../apps/web/src/styles/configs/index.js';

/** Reads a repository file used by the fixed-copy contract. */
function readRepositoryFile(relativePath: string): string {
  return String(readFileSync(resolve(process.cwd(), relativePath), 'utf8'));
}

/** Removes markup so the assertion covers only static page text and not attributes. */
function staticPageText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ');
}

describe('user-facing fixed copy', () => {
  /** Proves static, theme, and runtime labels do not expose English words. */
  it('contains no English words in fixed interface copy', () => {
    expect(staticPageText(readRepositoryFile('index.html'))).not.toMatch(
      /[A-Za-z]{2,}/,
    );
    expect(THEMES.map((theme) => theme.label).join(' ')).not.toMatch(
      /[A-Za-z]{2,}/,
    );
    expect(
      readRepositoryFile('apps/web/src/core/app-controller.ts'),
    ).not.toMatch(/(?:MY QUESTS|ALL QUESTS|QUEST)/);
    expect(
      readRepositoryFile('apps/web/src/tasks/task-renderer.ts'),
    ).not.toMatch(/(?:QUEST|ACTIVITY LOG)/);
  });
});
