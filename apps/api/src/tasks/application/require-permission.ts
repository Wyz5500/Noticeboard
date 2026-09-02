/** Converts public authorization decisions into task application failures. */
import type { AuthorizationPort } from '../../authorization/public/authorization.port.js';
import type { PermissionCode } from '../../authorization/public/permission.js';
import { AppError } from '../../common/application/app-error.js';

/** Requires an active account to hold the requested effective permission. */
export async function requirePermission(
  authorization: AuthorizationPort,
  userId: string,
  permission: PermissionCode,
): Promise<void> {
  if (!(await authorization.hasPermission(userId, permission)))
    throw new AppError('FORBIDDEN', '当前身份没有执行此操作的权限');
}
