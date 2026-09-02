/** Exposes declarative permission metadata while keeping the authorization Guard private. */
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';

import { RequireDemoIdentity } from '../../identity/public/require-demo-identity.decorator.js';
import { PermissionGuard } from '../presentation/permission.guard.js';
import { REQUIRED_PERMISSION } from '../presentation/required-permission.metadata.js';
import type { PermissionCode } from './permission.js';

/** Authenticates the demo identity before enforcing one fixed permission code. */
export function RequirePermission(
  permission: PermissionCode,
): ClassDecorator & MethodDecorator {
  return applyDecorators(
    RequireDemoIdentity(),
    SetMetadata(REQUIRED_PERMISSION, permission),
    UseGuards(PermissionGuard),
  );
}
