/** Implements framework-free role identity, permission mutation, and lifecycle rules. */
import { normalizePermissions, type PermissionCode } from './permission.js';
import { AuthorizationDomainError } from './domain-error.js';

export interface RoleSnapshot {
  id: string;
  code: string;
  name: string;
  builtin: boolean;
  permissions: PermissionCode[];
  deletedAt: string | null;
}

export class Role {
  /** Restores a detached role snapshot without exposing mutable internal collections. */
  private constructor(private snapshot: RoleSnapshot) {}

  /** Creates a custom active role with no permissions unless explicitly supplied. */
  static createCustom(
    id: string,
    name: string,
    permissions: readonly PermissionCode[] = [],
  ): Role {
    if (!id.trim() || !name.trim())
      throw new AuthorizationDomainError(
        'INVALID_ROLE',
        '请填写有效的角色名称',
      );
    return new Role({
      id: id.trim(),
      code: id.trim(),
      name: name.trim(),
      builtin: false,
      permissions: normalizePermissions(permissions),
      deletedAt: null,
    });
  }

  /** Creates a protected built-in role whose permissions are still adjustable. */
  static createBuiltin(
    id: string,
    code: string,
    name: string,
    permissions: readonly PermissionCode[],
  ): Role {
    if (!id.trim() || !code.trim() || !name.trim())
      throw new AuthorizationDomainError(
        'INVALID_ROLE',
        '请填写有效的角色信息',
      );
    return new Role({
      id: id.trim(),
      code: code.trim(),
      name: name.trim(),
      builtin: true,
      permissions: normalizePermissions(permissions),
      deletedAt: null,
    });
  }

  /** Restores a persisted role while detaching its permission collection. */
  static restore(snapshot: RoleSnapshot): Role {
    return new Role({
      ...snapshot,
      permissions: normalizePermissions(snapshot.permissions),
    });
  }

  /** Updates editable name and permission fields while protecting built-in identity. */
  update(name: string, permissions: readonly PermissionCode[]): void {
    if (this.snapshot.builtin && name.trim() !== this.snapshot.name)
      throw new AuthorizationDomainError(
        'INVALID_ROLE',
        '内置角色名称不可修改',
      );
    if (!name.trim())
      throw new AuthorizationDomainError(
        'INVALID_ROLE',
        '请填写有效的角色名称',
      );
    this.snapshot.name = name.trim();
    this.snapshot.permissions = normalizePermissions(permissions);
  }

  /** Marks a custom role deleted; built-in roles are permanently protected. */
  softDelete(at = new Date().toISOString()): void {
    if (this.snapshot.builtin)
      throw new AuthorizationDomainError('INVALID_ROLE', '内置角色不可删除');
    this.snapshot.deletedAt = at;
  }

  /** Restores a previously deleted custom role. */
  restore(): void {
    this.snapshot.deletedAt = null;
  }

  /** Returns the effective permission set detached from internal state. */
  permissions(): ReadonlySet<PermissionCode> {
    return new Set(this.snapshot.permissions);
  }

  /** Returns a detached role projection suitable for ports and persistence. */
  toSnapshot(): RoleSnapshot {
    return { ...this.snapshot, permissions: [...this.snapshot.permissions] };
  }
}
