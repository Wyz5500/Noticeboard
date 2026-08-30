/** Verifies readiness remains bounded even when PostgreSQL never settles a probe. */
import { describe, expect, it, vi } from 'vitest';

import { TypeOrmDatabaseReadiness } from './typeorm-database-readiness.js';

describe('TypeOrmDatabaseReadiness', () => {
  /** Proves an uninitialized pool is immediately reported unavailable. */
  it('rejects an uninitialized data source without querying it', async () => {
    const query = vi.fn<() => Promise<unknown>>();
    const readiness = new TypeOrmDatabaseReadiness(
      { isInitialized: false, query },
      25,
    );

    await expect(readiness.isReady()).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  /** Proves a stalled pool acquisition or query resolves false at the adapter deadline. */
  it('times out a probe that never settles', async () => {
    vi.useFakeTimers();
    const readiness = new TypeOrmDatabaseReadiness(
      {
        isInitialized: true,
        query: () => new Promise<never>(() => undefined),
      },
      25,
    );

    const result = readiness.isReady();
    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toBe(false);
    vi.useRealTimers();
  });
});
