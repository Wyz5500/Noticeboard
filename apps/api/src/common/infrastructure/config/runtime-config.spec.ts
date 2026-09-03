/** Tests host and database-only environment configuration boundaries. */
import { describe, expect, it } from 'vitest';

import * as runtimeConfig from './runtime-config.js';

/** Keeps application ports explicit so host processes cannot claim deployment port 3000 by default. */
describe('runtime config', () => {
  /** Accepts the operating system dynamic-port sentinel for host application orchestration. */
  it('accepts an explicit zero application port', () => {
    expect(
      runtimeConfig.loadRuntimeConfig({
        DATABASE_URL: 'postgresql://localhost/noticeboard',
        HOST: '127.0.0.1',
        PORT: '0',
      }),
    ).toEqual({
      databaseUrl: 'postgresql://localhost/noticeboard',
      host: '127.0.0.1',
      port: 0,
    });
  });

  /** Rejects an omitted port instead of silently occupying permanent deployment port 3000. */
  it('requires an explicit application port', () => {
    expect(() =>
      runtimeConfig.loadRuntimeConfig({
        DATABASE_URL: 'postgresql://localhost/noticeboard',
      }),
    ).toThrow('PORT is required');
  });

  /** Lets migration and seed commands read only the database variable they require. */
  it('loads a database URL without application listen settings', () => {
    expect(typeof runtimeConfig.loadDatabaseUrl).toBe('function');
    expect(
      runtimeConfig.loadDatabaseUrl({
        DATABASE_URL: ' postgresql://localhost/noticeboard ',
      }),
    ).toBe('postgresql://localhost/noticeboard');
    expect(() => runtimeConfig.loadDatabaseUrl({})).toThrow(
      'DATABASE_URL is required',
    );
  });
});
