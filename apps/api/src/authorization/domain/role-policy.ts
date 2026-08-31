/** Encodes cross-account authorization invariants independently from storage and HTTP. */
import type { PermissionCode } from './permission.js';

export interface ManagementPermissionChange {
  activeManagementUsers: number;
  targetHasManagement: boolean;
  nextPermissions: readonly PermissionCode[];
}

/** Prevents a mutation from removing the only active account with system management. */
export function assertCanRemoveManagementPermission(
  change: ManagementPermissionChange,
): void {
  if (
    change.targetHasManagement &&
    change.activeManagementUsers <= 1 &&
    !change.nextPermissions.includes('system.manage')
  ) {
    throw new Error('至少保留一名拥有系统管理权限的活跃用户');
  }
}
