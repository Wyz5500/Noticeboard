/** Verifies the preserved hash-route contract for home and in-memory task filtering. */
import { describe, expect, it } from 'vitest';

import { buildTaskHash, parseHash } from './router.js';

describe('hash router', () => {
  /** Proves task scope, Chinese status label, and search text round-trip through the URL. */
  it('round-trips the existing task hash contract', () => {
    const hash = buildTaskHash({
      scope: 'mine',
      filter: '进行中',
      query: '旧矿井 & 符文',
    });

    expect(hash).toBe(
      '#tasks?scope=mine&filter=进行中&q=%E6%97%A7%E7%9F%BF%E4%BA%95%20%26%20%E7%AC%A6%E6%96%87',
    );
    expect(parseHash(hash)).toEqual({
      view: 'tasks',
      scope: 'mine',
      filter: '进行中',
      query: '旧矿井 & 符文',
    });
  });

  /** Proves malformed routes and unsupported filters normalize to safe visible defaults. */
  it('normalizes unknown route values', () => {
    expect(parseHash('#unknown?scope=wrong&filter=不存在')).toEqual({
      view: 'home',
      scope: 'all',
      filter: '全部',
      query: '',
    });
  });

  /** Proves the empty browser hash opens the same home view as the old prototype. */
  it('defaults an empty hash to home', () => {
    expect(parseHash('')).toEqual({
      view: 'home',
      scope: 'all',
      filter: '全部',
      query: '',
    });
  });
});
