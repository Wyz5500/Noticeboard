/** Verifies application and long-running migration database option boundaries. */
import { describe, expect, it } from 'vitest';

import { postgresDataSourceOptions } from './database.js';

describe('PostgreSQL data source options', () => {
  /** Prevents long constraint validation from inheriting the interactive query timeout. */
  it('isolates migration transaction and query timeout settings', () => {
    const application = postgresDataSourceOptions(
      'postgresql://noticeboard:noticeboard@127.0.0.1:5432/noticeboard',
    );
    const migration = postgresDataSourceOptions(
      'postgresql://noticeboard:noticeboard@127.0.0.1:5432/noticeboard',
      'migration',
    );

    expect(application).toMatchObject({
      migrationsTransactionMode: 'all',
      extra: { query_timeout: 2_000 },
    });
    expect(migration).toMatchObject({
      migrationsTransactionMode: 'each',
      extra: { query_timeout: 0 },
    });
  });
});
