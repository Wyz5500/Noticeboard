/** Handwritten write contracts retain explicit optimistic versions without exposing generated types. */
import type { Permission, TaskType } from './models.js';

export type TaskAction = 'accept' | 'complete' | 'approve' | 'reopen' | 'close';
export type TaskRecoveryStrategy = 'preserve_status' | 'reopened';

export interface CreateTaskInput {
  title: string;
  type: TaskType;
  description: string;
  reward: string;
  dueDate: string;
}

export interface ActTaskInput {
  action: TaskAction;
  expectedVersion: number;
}

export interface RenewTaskInput {
  dueDate: string;
  recoveryStrategy: TaskRecoveryStrategy;
  expectedVersion: number;
}

export interface CreateCommentInput {
  content: string;
  expectedVersion: number;
}

export interface EditCommentInput {
  content: string;
  expectedVersion: number;
}

export interface DeleteCommentInput {
  expectedVersion: number;
}

/** Creates a managed user with a server-generated identifier and username. */
export interface CreateAdminUserInput {
  name: string;
  roleId: string;
}

/** Updates only supplied user fields; authorization remains server-owned. */
export interface UpdateAdminUserInput {
  name?: string;
  roleId?: string;
}

/** Creates a custom role, using the server's empty permission default when omitted. */
export interface CreateAdminRoleInput {
  name: string;
  permissions?: Permission[];
}

/** Replaces the role's complete editable state without an implicit pre-read. */
export interface UpdateAdminRoleInput {
  name: string;
  permissions: Permission[];
}
