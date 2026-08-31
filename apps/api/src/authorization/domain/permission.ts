/** Defines the fixed authorization catalog shared by domain and presentation adapters. */

export const ALL_PERMISSION_CODES = [
  'system.manage',
  'tasks.view',
  'tasks.create',
  'tasks.accept',
  'tasks.complete',
  'tasks.review',
  'tasks.close',
  'demo.reset',
] as const;

export type PermissionCode = (typeof ALL_PERMISSION_CODES)[number];

/** Returns whether an unknown input belongs to the fixed permission catalog. */
export function isPermissionCode(value: string): value is PermissionCode {
  return ALL_PERMISSION_CODES.includes(value as PermissionCode);
}

/** Removes duplicates and returns permission codes in stable catalog order. */
export function normalizePermissions(
  permissions: readonly PermissionCode[],
): PermissionCode[] {
  return ALL_PERMISSION_CODES.filter((code) => permissions.includes(code));
}
