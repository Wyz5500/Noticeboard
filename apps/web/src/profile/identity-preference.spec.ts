/** Verifies current-user persistence under the product-scoped browser storage key. */
import { describe, expect, it } from 'vitest';

import {
  USER_STORAGE_KEY,
  loadCurrentUserId,
  saveCurrentUserId,
} from './identity-preference.js';

/** Implements deterministic browser storage including removals for migration assertions. */
class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  /** Reports the number of persisted keys. */
  get length(): number {
    return this.values.size;
  }

  /** Removes every persisted value. */
  clear(): void {
    this.values.clear();
  }

  /** Returns one stored string or null. */
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  /** Returns a key by insertion order. */
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  /** Removes one key. */
  removeItem(key: string): void {
    this.values.delete(key);
  }

  /** Persists one string value. */
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const KNOWN_IDS = new Set([
  'noticeboard-master',
  'adventurer-a',
  'adventurer-b',
]);

describe('identity preference', () => {
  /** Proves browser state is scoped to the current product. */
  it('uses the Noticeboard identity storage key', () => {
    expect(USER_STORAGE_KEY).toBe('noticeboard-user');
  });

  /** Proves an empty browser preference uses the deterministic demo identity. */
  it('falls back to the default demo identity when no preference exists', () => {
    const storage = new MemoryStorage();

    expect(loadCurrentUserId(storage, KNOWN_IDS)).toBe('noticeboard-master');
    expect(storage.getItem(USER_STORAGE_KEY)).toBe(
      JSON.stringify({ currentUserId: 'noticeboard-master' }),
    );
  });

  /** Proves malformed or unknown preferences normalize to the default identity. */
  it.each(['broken-json', JSON.stringify({ currentUserId: 'unknown' })])(
    'falls back for invalid stored content',
    (value) => {
      const storage = new MemoryStorage();
      storage.setItem(USER_STORAGE_KEY, value);

      expect(loadCurrentUserId(storage, KNOWN_IDS)).toBe('noticeboard-master');
      expect(storage.getItem(USER_STORAGE_KEY)).toBe(
        JSON.stringify({ currentUserId: 'noticeboard-master' }),
      );
    },
  );

  /** Proves the new identity-only key takes precedence and remains minimal. */
  it('loads and saves the identity-only storage contract', () => {
    const storage = new MemoryStorage();
    saveCurrentUserId(storage, 'adventurer-b', KNOWN_IDS);

    expect(loadCurrentUserId(storage, KNOWN_IDS)).toBe('adventurer-b');
    expect(JSON.parse(storage.getItem(USER_STORAGE_KEY)!)).toEqual({
      currentUserId: 'adventurer-b',
    });
  });
});
