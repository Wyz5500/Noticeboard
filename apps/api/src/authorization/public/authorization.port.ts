/** Defines the narrow authorization decision capability available to other Features. */
import type { PermissionCode } from './permission.js';

export interface AuthorizationPort {
  /** Returns whether an active account currently has one effective permission. */
  hasPermission(userId: string, permission: PermissionCode): Promise<boolean>;
}

export const AUTHORIZATION = Symbol('AUTHORIZATION');
