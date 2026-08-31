/** Defines pure, deterministic sorting rules for administrator management lists. */
import type {
  AdminRoleResource,
  AdminUserResource,
} from '../core/api-types.js';

export type AdminSection = 'overview' | 'users' | 'roles';
export type AdminSortDirection = 'asc' | 'desc';
export type AdminUserSortField = 'name' | 'role' | 'status' | 'updatedAt';
export type AdminRoleSortField =
  'name' | 'code' | 'permissions' | 'status' | 'updatedAt';
export type AdminSortField = AdminUserSortField | AdminRoleSortField;
export interface AdminSortState {
  field: AdminSortField;
  direction: AdminSortDirection;
}

const USER_SORT_FIELDS: readonly AdminUserSortField[] = [
  'name',
  'role',
  'status',
  'updatedAt',
];
const ROLE_SORT_FIELDS: readonly AdminRoleSortField[] = [
  'name',
  'code',
  'permissions',
  'status',
  'updatedAt',
];
const DEFAULT_SORT_FIELDS: Record<AdminSection, AdminSortField> = {
  overview: 'updatedAt',
  users: 'updatedAt',
  roles: 'updatedAt',
};

/** Returns whether a sort field is valid for the selected management section. */
export function isAdminSortField(
  section: AdminSection,
  field: AdminSortField,
): boolean {
  return section === 'roles'
    ? ROLE_SORT_FIELDS.includes(field as AdminRoleSortField)
    : USER_SORT_FIELDS.includes(field as AdminUserSortField);
}

/** Returns the safe default used by every sortable management child page. */
export function defaultAdminSort(section: AdminSection): AdminSortState {
  return {
    field: DEFAULT_SORT_FIELDS[section],
    direction: 'desc',
  };
}

/** Advances a selected field to ascending order or toggles its current direction. */
export function nextAdminSort(
  section: AdminSection,
  current: AdminSortState,
  field: AdminSortField,
): AdminSortState {
  if (!isAdminSortField(section, field)) return defaultAdminSort(section);
  return {
    field,
    direction:
      current.field === field && current.direction === 'asc' ? 'desc' : 'asc',
  };
}

/** Compares two sortable values using the shared ascending/descending semantics. */
function compareValues(
  left: string | number | boolean,
  right: string | number | boolean,
): number {
  if (typeof left === 'number' && typeof right === 'number')
    return left - right;
  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return Number(left) - Number(right);
  }
  return String(left).localeCompare(String(right), 'zh-Hans');
}

/** Sorts a copied management list without mutating the API snapshot. */
/** Sorts user resources with user-specific sort fields. */
export function sortAdminRecords(
  section: 'users',
  records: readonly AdminUserResource[],
  sort: AdminSortState,
): AdminUserResource[];
/** Sorts role resources with role-specific sort fields. */
export function sortAdminRecords(
  section: 'roles',
  records: readonly AdminRoleResource[],
  sort: AdminSortState,
): AdminRoleResource[];
/** Applies a validated sort state to either administrator resource collection. */
export function sortAdminRecords(
  section: 'users' | 'roles',
  records: readonly (AdminUserResource | AdminRoleResource)[],
  sort: AdminSortState,
): (AdminUserResource | AdminRoleResource)[] {
  const safeSort = isAdminSortField(section, sort.field)
    ? sort
    : defaultAdminSort(section);
  return [...records].sort((left, right) => {
    const leftValue =
      section === 'users'
        ? userSortValue(left as AdminUserResource, safeSort.field)
        : roleSortValue(left as AdminRoleResource, safeSort.field);
    const rightValue =
      section === 'users'
        ? userSortValue(right as AdminUserResource, safeSort.field)
        : roleSortValue(right as AdminRoleResource, safeSort.field);
    const primary = compareValues(leftValue, rightValue);
    if (primary !== 0) return safeSort.direction === 'asc' ? primary : -primary;
    return left.id.localeCompare(right.id);
  });
}

/** Extracts a user value for the selected public sort vocabulary. */
function userSortValue(
  user: AdminUserResource,
  field: AdminSortField,
): string | boolean {
  if (field === 'role') return user.roleName;
  if (field === 'status') return user.active;
  if (field === 'updatedAt') return user.updatedAt;
  return user.name;
}

/** Extracts a role value for the selected public sort vocabulary. */
function roleSortValue(
  role: AdminRoleResource,
  field: AdminSortField,
): string | number | boolean {
  if (field === 'code') return role.code;
  if (field === 'permissions') return role.permissions.length;
  if (field === 'status') return role.active;
  if (field === 'updatedAt') return role.updatedAt;
  return role.name;
}
