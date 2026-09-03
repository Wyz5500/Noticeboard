/** Defines the browser-facing OpenAPI resource shapes without sharing server DTO classes. */

export type TaskWorkflowStatus =
  'not_started' | 'in_progress' | 'completed' | 'reopened' | 'closed';
export type TaskStatus = TaskWorkflowStatus | 'expired';
export type TaskAction = 'accept' | 'complete' | 'approve' | 'reopen' | 'close';
export type TaskRecoveryStrategy = 'preserve_status' | 'reopened';
export type TaskType =
  'exploration' | 'collection' | 'escort' | 'bounty' | 'building';

export interface ActorResource {
  id: string;
  username: string;
  name: string;
  role: string;
  roleLabel: string;
  permissions?: PermissionCode[];
}

export interface AdminUserResource {
  id: string;
  name: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  active: boolean;
  deletedAt: string | null;
  updatedAt: string;
}

export interface AdminRoleResource {
  id: string;
  code: string;
  name: string;
  builtin: boolean;
  permissions: PermissionCode[];
  active: boolean;
  deletedAt: string | null;
  updatedAt: string;
}

export interface PermissionResource {
  code: PermissionCode;
  name: string;
  description: string;
}

export interface AdminOverviewResource {
  users: AdminUserResource[];
  roles: AdminRoleResource[];
  permissions: PermissionResource[];
}

export interface CreateAdminUserRequest {
  name: string;
  roleId: string;
}

export interface UpdateAdminUserRequest {
  name?: string;
  roleId?: string;
}

export interface CreateAdminRoleRequest {
  name: string;
  permissions?: PermissionCode[];
}

export interface UpdateAdminRoleRequest {
  name: string;
  permissions: PermissionCode[];
}

export interface TaskActivityResource {
  kind: 'activity';
  sequence: number;
  action:
    | 'created'
    | 'accepted'
    | 'completed'
    | 'approved'
    | 'reopened'
    | 'renewed'
    | 'closed';
  actionLabel: string;
  actor: ActorResource;
  at: string;
  detail: string;
}

export interface TaskCommentResource {
  kind: 'comment';
  sequence: number;
  commentId: string;
  actor: ActorResource;
  at: string;
  content: string | null;
  edited: boolean;
  deleted: boolean;
  deletedAt: string | null;
  deletedByUsername: string | null;
}

export type TaskTimelineResource = TaskActivityResource | TaskCommentResource;

export interface TaskResource {
  id: string;
  title: string;
  type: TaskType;
  typeLabel: string;
  description: string;
  reward: string;
  dueDate: string;
  publisher: ActorResource;
  assignee: ActorResource | null;
  workflowStatus: TaskWorkflowStatus;
  workflowStatusLabel: string;
  status: TaskStatus;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  timeline: TaskTimelineResource[];
}

export interface CreateTaskCommentRequest {
  content: string;
  expectedVersion: number;
}

export interface EditTaskCommentRequest {
  content: string;
  expectedVersion: number;
}

export interface DeleteTaskCommentRequest {
  expectedVersion: number;
}

export interface CreateTaskRequest {
  title: string;
  type: TaskType;
  description: string;
  reward: string;
  dueDate: string;
}

export interface ActTaskRequest {
  action: TaskAction;
  expectedVersion: number;
}

export interface RenewExpiredTaskRequest {
  dueDate: string;
  recoveryStrategy: TaskRecoveryStrategy;
  expectedVersion: number;
}

export type PermissionCode =
  | 'system.manage'
  | 'tasks.view'
  | 'tasks.create'
  | 'tasks.accept'
  | 'tasks.complete'
  | 'tasks.review'
  | 'tasks.close'
  | 'demo.reset';
