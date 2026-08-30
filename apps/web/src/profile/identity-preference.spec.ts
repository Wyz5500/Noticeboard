/** Verifies current-user persistence and one-time cleanup of the legacy task localStorage key. */
import { describe, expect, it } from 'vitest';

import {
  LEGACY_STATE_KEY,
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

const KNOWN_IDS = new Set(['guild-master', 'adventurer-a', 'adventurer-b']);

describe('identity preference', () => {
  /** Proves a valid identity migrates while all legacy browser task data is deleted. */
  it('migrates a valid identity from the legacy state key', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LEGACY_STATE_KEY,
      JSON.stringify({
        currentUserId: 'adventurer-a',
        tasks: [{ secret: 'old task data' }],
      }),
    );

    expect(loadCurrentUserId(storage, KNOWN_IDS)).toBe('adventurer-a');
    expect(storage.getItem(USER_STORAGE_KEY)).toBe(
      JSON.stringify({ currentUserId: 'adventurer-a' }),
    );
    expect(storage.getItem(LEGACY_STATE_KEY)).toBeNull();
  });

  /** Proves invalid JSON and unknown identities fall back without retaining the old task key. */
  it.each([
    'broken-json',
    JSON.stringify({ currentUserId: 'unknown', tasks: [] }),
  ])('falls back for invalid legacy content', (legacy) => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_STATE_KEY, legacy);

    expect(loadCurrentUserId(storage, KNOWN_IDS)).toBe('guild-master');
    expect(storage.getItem(LEGACY_STATE_KEY)).toBeNull();
  });

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
