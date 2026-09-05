/** Sole public SDK entry: handwritten resources, options and errors only. */
export { createNoticeboardClient } from './internal/client.js';
export {
  NoticeboardApiError,
  NoticeboardNetworkError,
  NoticeboardProtocolError,
} from './errors.js';
export type { ApiErrorMetadata } from './errors.js';
export type {
  CreateAdminUserInput,
  UpdateAdminUserInput,
  CreateAdminRoleInput,
  UpdateAdminRoleInput,
  CreateTaskInput,
  ActTaskInput,
  RenewTaskInput,
  CreateCommentInput,
  EditCommentInput,
  DeleteCommentInput,
  TaskAction,
  TaskRecoveryStrategy,
} from './inputs.js';
export type {
  AdminOverview,
  AdminUser,
  AdminRole,
  AdminPermission,
  Identity,
  Permission,
  Task,
  TaskActivity,
  TaskActivityAction,
  TaskComment,
  TaskStatus,
  TaskTimelineEvent,
  TaskType,
  TaskWorkflowStatus,
} from './models.js';
export type {
  HeadersProvider,
  NoticeboardClient,
  NoticeboardClientOptions,
  RequestOptions,
} from './options.js';
