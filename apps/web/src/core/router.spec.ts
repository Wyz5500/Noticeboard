/** Verifies the preserved hash-route contract for home and in-memory task filtering. */
import { describe, expect, it } from 'vitest';

import { buildTaskHash, normalizeHash, parseHash } from './router.js';

describe('hash router', () => {
  /** Proves the new management hash is normalized as an independent view. */
  it('recognizes the admin route', () => {
    expect(parseHash('#admin')).toMatchObject({
      view: 'admin',
      scope: 'all',
      filter: '全部',
      query: '',
    });
  });
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

  /** Proves empty and explicit home hashes share the canonical home URL. */
  it('normalizes empty hash to the canonical home hash', () => {
    expect(normalizeHash('')).toBe('#home');
    expect(normalizeHash('#home')).toBe('#home');
    expect(normalizeHash('#admin')).toBe('#admin');
  });

  /** Proves raw and encoded task hashes with reordered parameters share one canonical URL. */
  it('normalizes equivalent raw and encoded task hashes identically', () => {
    const canonicalHash = buildTaskHash({
      scope: 'mine',
      filter: '进行中',
      query: '旧矿井 & 符文',
    });

    expect(
      normalizeHash(
        '#tasks?q=%E6%97%A7%E7%9F%BF%E4%BA%95%20%26%20%E7%AC%A6%E6%96%87&filter=%E8%BF%9B%E8%A1%8C%E4%B8%AD&scope=mine',
      ),
    ).toBe(canonicalHash);
    expect(
      normalizeHash('#tasks?q=旧矿井%20%26%20符文&scope=mine&filter=进行中'),
    ).toBe(canonicalHash);
  });
});
