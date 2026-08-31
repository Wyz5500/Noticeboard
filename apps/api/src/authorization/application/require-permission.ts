/** Resolves one authorization decision into a stable application failure. */
import { AppError } from '../../common/application/app-error.js';
import type { PermissionCode } from '../domain/permission.js';
import type { AuthorizationPort } from './ports/authorization.port.js';

/** Requires an active account to hold the requested effective permission. */
export async function requirePermission(
  authorization: AuthorizationPort,
  userId: string,
  permission: PermissionCode,
): Promise<void> {
  if (!(await authorization.hasPermission(userId, permission)))
    throw new AppError('FORBIDDEN', '当前身份没有执行此操作的权限');
}
