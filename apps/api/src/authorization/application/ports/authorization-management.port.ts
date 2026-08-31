/** Defines admin projections and mutations without exposing ORM or transport types. */
import type { PermissionCode } from '../../domain/permission.js';

export interface AdminUserModel {
  id: string;
  name: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  active: boolean;
  deletedAt: string | null;
}

export interface AdminRoleModel {
  id: string;
  code: string;
  name: string;
  builtin: boolean;
  permissions: PermissionCode[];
  active: boolean;
  deletedAt: string | null;
}

export interface PermissionModel {
  code: PermissionCode;
  name: string;
  description: string;
}

export interface AdminOverviewModel {
  users: AdminUserModel[];
  roles: AdminRoleModel[];
  permissions: PermissionModel[];
}

export interface CreateAdminUserCommand {
  name: string;
  roleId: string;
}

export interface UpdateAdminUserCommand {
  name?: string;
  roleId?: string;
}

export interface CreateAdminRoleCommand {
  name: string;
  permissions?: PermissionCode[];
}

export interface UpdateAdminRoleCommand {
  name: string;
  permissions: PermissionCode[];
}

export interface AuthorizationManagementPort {
  overview(): Promise<AdminOverviewModel>;
  createUser(command: CreateAdminUserCommand): Promise<AdminUserModel>;
  updateUser(
    id: string,
    command: UpdateAdminUserCommand,
  ): Promise<AdminUserModel>;
  softDeleteUser(id: string): Promise<void>;
  restoreUser(id: string): Promise<AdminUserModel>;
  createRole(command: CreateAdminRoleCommand): Promise<AdminRoleModel>;
  updateRole(
    id: string,
    command: UpdateAdminRoleCommand,
  ): Promise<AdminRoleModel>;
  softDeleteRole(id: string): Promise<void>;
  restoreRole(id: string): Promise<AdminRoleModel>;
}

export const AUTHORIZATION_MANAGEMENT = Symbol('AUTHORIZATION_MANAGEMENT');
