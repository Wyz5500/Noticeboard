/** Defines minimal authorization persistence shapes needed by relational Feature integration. */

export const AUTHORIZATION_ROLE_ENTITY = 'RoleOrmEntity';

export interface AuthorizationRolePermissionPersistenceRecord {
  roleId: string;
  permissionCode: string;
}

export interface AuthorizationRolePersistenceRecord {
  id: string;
  code: string;
  name: string;
  builtin: boolean;
  deletedAt: Date | null;
  updatedAt: Date;
  rolePermissions: AuthorizationRolePermissionPersistenceRecord[];
}
