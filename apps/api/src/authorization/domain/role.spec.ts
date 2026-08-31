/** Verifies role permission semantics and the protected administrator invariant. */
import { describe, expect, it } from 'vitest';

import { ALL_PERMISSION_CODES, type PermissionCode } from './permission.js';
import { Role } from './role.js';
import { assertCanRemoveManagementPermission } from './role-policy.js';

/** Exercises the permission set as the domain's authorization source of truth. */
describe('authorization role domain', () => {
  /** Confirms new custom roles start with no inherited permissions. */
  it('creates a custom role with no permissions by default', () => {
    const role = Role.createCustom('role-scout', '侦察员');

    expect(role.toSnapshot()).toMatchObject({
      id: 'role-scout',
      name: '侦察员',
      builtin: false,
      deletedAt: null,
      permissions: [],
    });
  });

  /** Confirms a role exposes exactly the fixed permission catalog it was given. */
  it('normalizes and reports a role permission set', () => {
    const permissions: PermissionCode[] = [
      'tasks.view',
      'tasks.view',
      'tasks.accept',
    ];
    const role = Role.createCustom('role-scout', '侦察员', permissions);

    expect([...role.permissions()]).toEqual(['tasks.view', 'tasks.accept']);
    expect(ALL_PERMISSION_CODES).toContain('system.manage');
  });

  /** Confirms built-in names and codes cannot be changed while permissions remain editable. */
  it('protects built-in identity but allows permission updates', () => {
    const role = Role.createBuiltin(
      'role-admin',
      'system_admin',
      '系统管理员',
      ALL_PERMISSION_CODES,
    );

    expect(() => role.update('改名', ['tasks.view'])).toThrow(
      '内置角色名称不可修改',
    );
    expect(() => role.softDelete()).toThrow('内置角色不可删除');
    role.update('系统管理员', ['tasks.view']);
    expect([...role.permissions()]).toEqual(['tasks.view']);
  });

  /** Confirms the final active management user cannot lose management access. */
  it('rejects removing management access from the last active administrator', () => {
    expect(() =>
      assertCanRemoveManagementPermission({
        activeManagementUsers: 1,
        targetHasManagement: true,
        nextPermissions: ['tasks.view'],
      }),
    ).toThrow('至少保留一名拥有系统管理权限的活跃用户');

    expect(() =>
      assertCanRemoveManagementPermission({
        activeManagementUsers: 2,
        targetHasManagement: true,
        nextPermissions: ['tasks.view'],
      }),
    ).not.toThrow();
  });
});
