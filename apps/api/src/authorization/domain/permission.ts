/** Keeps permission normalization inside Domain while the catalog remains a public contract. */
import {
  ALL_PERMISSION_CODES,
  type PermissionCode,
} from '../public/permission.js';

export {
  ALL_PERMISSION_CODES,
  type PermissionCode,
} from '../public/permission.js';

/** Removes duplicates and returns permission codes in stable catalog order. */
export function normalizePermissions(
  permissions: readonly PermissionCode[],
): PermissionCode[] {
  return ALL_PERMISSION_CODES.filter((code) => permissions.includes(code));
}
