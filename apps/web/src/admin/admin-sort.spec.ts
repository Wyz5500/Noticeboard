/** Verifies the pure administrator list sort contract and deterministic ordering. */
import { describe, expect, it } from 'vitest';

import type {
  AdminRoleResource,
  AdminUserResource,
} from '../core/api-types.js';
import {
  defaultAdminSort,
  nextAdminSort,
  sortAdminRecords,
} from './admin-sort.js';

const user = (
  id: string,
  name: string,
  updatedAt: string,
  overrides: Partial<AdminUserResource> = {},
): AdminUserResource => ({
  id,
  name,
  roleId: 'role-user',
  roleCode: 'user',
  roleName: '用户',
  active: true,
  deletedAt: null,
  updatedAt,
  ...overrides,
});

const role = (
  id: string,
  name: string,
  permissions: AdminRoleResource['permissions'],
  overrides: Partial<AdminRoleResource> = {},
): AdminRoleResource => ({
  id,
  code: id,
  name,
  builtin: false,
  permissions,
  active: true,
  deletedAt: null,
  updatedAt: '2026-08-30T09:00:00.000Z',
  ...overrides,
});

describe('admin sort', () => {
  it('defaults both management lists to most recently updated first', () => {
    expect(defaultAdminSort('users')).toEqual({
      field: 'updatedAt',
      direction: 'desc',
    });
    expect(defaultAdminSort('roles')).toEqual({
      field: 'updatedAt',
      direction: 'desc',
    });
  });

  it('starts a new field ascending and toggles the active field direction', () => {
    const current = defaultAdminSort('users');

    expect(nextAdminSort('users', current, 'name')).toEqual({
      field: 'name',
      direction: 'asc',
    });
    expect(nextAdminSort('users', current, 'updatedAt')).toEqual({
      field: 'updatedAt',
      direction: 'asc',
    });
    expect(
      nextAdminSort('users', { field: 'name', direction: 'asc' }, 'name'),
    ).toEqual({ field: 'name', direction: 'desc' });
  });

  it('sorts users in either direction and uses id as the stable tie-break', () => {
    const records = [
      user('user-b', 'Alpha', '2026-08-30T09:00:00.000Z'),
      user('user-a', 'Alpha', '2026-08-30T09:00:00.000Z'),
      user('user-c', 'Zeta', '2026-08-31T09:00:00.000Z'),
    ];

    expect(
      sortAdminRecords('users', records, defaultAdminSort('users')).map(
        (item) => item.id,
      ),
    ).toEqual(['user-c', 'user-a', 'user-b']);
    expect(
      sortAdminRecords('users', records, {
        field: 'name',
        direction: 'asc',
      }).map((item) => item.id),
    ).toEqual(['user-a', 'user-b', 'user-c']);
    expect(
      sortAdminRecords('users', records, {
        field: 'name',
        direction: 'desc',
      }).map((item) => item.id),
    ).toEqual(['user-c', 'user-a', 'user-b']);
  });

  it('sorts roles by numeric permission count', () => {
    const records = [
      role(
        'role-10',
        '十',
        Array(10).fill('tasks.view') as AdminRoleResource['permissions'],
      ),
      role(
        'role-2',
        '二',
        Array(2).fill('tasks.view') as AdminRoleResource['permissions'],
      ),
      role(
        'role-1',
        '一',
        Array(1).fill('tasks.view') as AdminRoleResource['permissions'],
      ),
    ];

    expect(
      sortAdminRecords('roles', records, {
        field: 'permissions',
        direction: 'asc',
      }).map((item) => item.id),
    ).toEqual(['role-1', 'role-2', 'role-10']);
  });
});
