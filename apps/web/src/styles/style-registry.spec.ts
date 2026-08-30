/** Verifies typed theme registration, persistence fallback, batch application, and rollback. */
import { describe, expect, it } from 'vitest';

import { THEMES } from './configs/index.js';
import {
  FALLBACK_STYLE_ID,
  STYLE_STORAGE_KEY,
  STYLE_TOKEN_KEYS,
  StyleRegistry,
  loadStyleId,
  saveStyleId,
} from './style-registry.js';

/** Supplies minimal key-value storage for preference tests. */
class MemoryStorage {
  readonly values = new Map<string, string>();

  /** Reads one preference value. */
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  /** Writes one preference value. */
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('style registry', () => {
  /** Proves all ten themes retain their original order and complete token contract. */
  it('registers ten complete themes in the preserved order', () => {
    const registry = new StyleRegistry(THEMES);

    expect(registry.options.map((option) => option.id)).toEqual([
      'swiss-international',
      'neo-brutalism',
      'bauhaus',
      'y2k-cyber',
      'retro-terminal',
      'memphis',
      'editorial-magazine',
      'glassmorphism',
      'japanese-minimalism',
      'pixel-retro',
    ]);
    expect(STYLE_TOKEN_KEYS).toHaveLength(22);
    for (const theme of THEMES)
      expect(Object.keys(theme.tokens).sort()).toEqual(
        [...STYLE_TOKEN_KEYS].sort(),
      );
    expect(
      new Set(THEMES.map((theme) => theme.tokens['--display-font'])).size,
    ).toBe(10);
  });

  /** Proves duplicate IDs and incomplete theme objects fail registration before use. */
  it('rejects duplicate and incomplete configurations', () => {
    expect(() => new StyleRegistry([THEMES[0], THEMES[0]])).toThrow(
      'Duplicate style configuration',
    );
    expect(
      () =>
        new StyleRegistry([
          {
            id: 'missing-token',
            label: 'Missing',
            tokens: { '--ink': '#000' },
          } as (typeof THEMES)[number],
        ]),
    ).toThrow('is missing');
  });

  /** Proves invalid persisted values normalize to Swiss International. */
  it('persists only normalized style IDs', () => {
    const registry = new StyleRegistry(THEMES);
    const storage = new MemoryStorage();

    expect(loadStyleId(storage, registry)).toBe(FALLBACK_STYLE_ID);
    expect(saveStyleId(storage, registry, 'pixel-retro')).toBe('pixel-retro');
    expect(loadStyleId(storage, registry)).toBe('pixel-retro');
    expect(saveStyleId(storage, registry, 'invalid')).toBe(FALLBACK_STYLE_ID);
    expect(storage.values.get(STYLE_STORAGE_KEY)).toBe(FALLBACK_STYLE_ID);
  });

  /** Proves applying a theme writes one complete cssText batch. */
  it('applies all tokens in one batch', () => {
    const registry = new StyleRegistry(THEMES);
    let writes = 0;
    let cssText = '';
    const target = Object.defineProperty({}, 'cssText', {
      get: () => cssText,
      set: (value: string) => {
        writes += 1;
        cssText = value;
      },
    }) as { cssText: string };

    expect(registry.apply('neo-brutalism', target)).toBe('neo-brutalism');
    expect(writes).toBe(1);
    expect(cssText).toContain('--ink: #171717;');
  });

  /** Proves a failed CSS batch restores the prior declaration before surfacing the error. */
  it('rolls back a failed batch application', () => {
    const registry = new StyleRegistry(THEMES);
    let attempts = 0;
    let cssText = '--ink: old-color;';
    const target = Object.defineProperty({}, 'cssText', {
      get: () => cssText,
      set: (value: string) => {
        attempts += 1;
        if (attempts === 1) throw new Error('style update failed');
        cssText = value;
      },
    }) as { cssText: string };

    expect(() => registry.apply('bauhaus', target)).toThrow(
      'style update failed',
    );
    expect(cssText).toBe('--ink: old-color;');
  });
});
