/** Defines the narrow authorization capability consumed by task and demo application use cases. */
import type { PermissionCode } from '../../domain/permission.js';

export interface AuthorizationPort {
  /** Returns whether an active account currently has one effective permission. */
  hasPermission(userId: string, permission: PermissionCode): Promise<boolean>;
}

export const AUTHORIZATION = Symbol('AUTHORIZATION');
