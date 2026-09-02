/** Verifies the preserved hash-route contract for home and in-memory task filtering. */
import { describe, expect, it } from 'vitest';

import {
  buildAdminHash,
  buildTaskHash,
  normalizeHash,
  parseHash,
} from './router.js';

describe('hash router', () => {
  /** Proves the new management hash is normalized as an independent view. */
  it('recognizes the admin route', () => {
    expect(parseHash('#admin')).toMatchObject({
      view: 'admin',
      section: 'overview',
      scope: 'all',
      filter: '全部',
      query: '',
    });
  });

  /** Proves management child routes normalize their section and sort query. */
  it('recognizes and normalizes admin child routes', () => {
    expect(parseHash('#admin/users?sort=name&direction=asc')).toMatchObject({
      view: 'admin',
      section: 'users',
      sort: { field: 'name', direction: 'asc' },
    });
    expect(
      parseHash('#admin/roles?sort=permissions&direction=desc'),
    ).toMatchObject({
      view: 'admin',
      section: 'roles',
      sort: { field: 'permissions', direction: 'desc' },
    });
    expect(
      parseHash('#admin/users?sort=permissions&direction=sideways'),
    ).toMatchObject({
      section: 'users',
      sort: { field: 'updatedAt', direction: 'desc' },
    });
  });

  /** Proves admin hash serialization keeps only valid child-page sort state. */
  it('normalizes admin hashes when building them', () => {
    expect(buildAdminHash('users', { field: 'name', direction: 'asc' })).toBe(
      '#admin/users?sort=name&direction=asc',
    );
    expect(
      buildAdminHash('overview', { field: 'name', direction: 'asc' }),
    ).toBe('#admin');
  });

  /** Proves admin child routes retain their section and canonical sort state. */
  it('normalizes admin child hashes without collapsing them to the landing page', () => {
    expect(normalizeHash('#admin/users')).toBe(
      '#admin/users?sort=updatedAt&direction=desc',
    );
    expect(normalizeHash('#admin/roles?sort=name&direction=asc')).toBe(
      '#admin/roles?sort=name&direction=asc',
    );
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

  /** Proves the derived expired status round-trips through the Chinese hash vocabulary. */
  it('round-trips the expired task filter', () => {
    const hash = buildTaskHash({
      scope: 'all',
      filter: '已失效',
      query: '',
    });

    expect(hash).toBe('#tasks?scope=all&filter=已失效');
    expect(parseHash(hash)).toMatchObject({
      view: 'tasks',
      scope: 'all',
      filter: '已失效',
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
