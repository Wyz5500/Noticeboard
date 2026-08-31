/** Declares the permission required by a presentation handler for the permission guard. */
import { SetMetadata, type CustomDecorator } from '@nestjs/common';

import type { PermissionCode } from '../domain/permission.js';

export const REQUIRED_PERMISSION = Symbol('REQUIRED_PERMISSION');

/** Attaches one fixed permission code to a controller method. */
export function RequirePermission(
  permission: PermissionCode,
): CustomDecorator<typeof REQUIRED_PERMISSION> {
  return SetMetadata(REQUIRED_PERMISSION, permission);
}
