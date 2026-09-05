/** Public construction and cancellation contracts; SDK configuration is supplied entirely by callers. */
import type {
  DemoResetResult,
  AdminOverview,
  AdminUser,
  AdminRole,
  Identity,
  Task,
} from './models.js';
import type {
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
} from './inputs.js';

/** Supplies current authentication headers for each request without SDK credential storage. */
export type HeadersProvider = () => HeadersInit | Promise<HeadersInit>;

export interface NoticeboardClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  getHeaders?: HeadersProvider;
  signal?: AbortSignal;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface NoticeboardClient {
  demo: {
    /** Replaces all demo tasks once; callers own confirmation and uncertain-outcome reconciliation. */
    reset(options?: RequestOptions): Promise<DemoResetResult>;
  };
  admin: {
    /** Reads the complete protected overview, retaining deleted records and server order. */
    overview(options?: RequestOptions): Promise<AdminOverview>;
    roles: {
      /** Creates once, leaving identifiers and business rules to the server. */
      create(
        input: CreateAdminRoleInput,
        options?: RequestOptions,
      ): Promise<AdminRole>;
      /** Sends the supplied edit without pre-reading or retrying. */
      update(
        id: string,
        input: UpdateAdminRoleInput,
        options?: RequestOptions,
      ): Promise<AdminRole>;
      /** Soft-deletes once and accepts only the existing HTTP 204 response. */
      delete(id: string, options?: RequestOptions): Promise<void>;
      /** Restores a resource subject to the server's management constraints. */
      restore(id: string, options?: RequestOptions): Promise<AdminRole>;
    };

    users: {
      /** Creates once, leaving identifiers and business rules to the server. */
      create(
        input: CreateAdminUserInput,
        options?: RequestOptions,
      ): Promise<AdminUser>;
      /** Sends the supplied edit without pre-reading or retrying. */
      update(
        id: string,
        input: UpdateAdminUserInput,
        options?: RequestOptions,
      ): Promise<AdminUser>;
      /** Soft-deletes once and accepts only the existing HTTP 204 response. */
      delete(id: string, options?: RequestOptions): Promise<void>;
      /** Restores a resource subject to the server's management constraints. */
      restore(id: string, options?: RequestOptions): Promise<AdminUser>;
    };
  };
  tasks: {
    /** Reads the complete server-ordered list without filtering, caching or retrying. */
    list(options?: RequestOptions): Promise<Task[]>;
    /** Reads one task and its public timeline using a path-encoded identifier. */
    get(taskId: string, options?: RequestOptions): Promise<Task>;
    /** Creates once; uncertain outcomes must be reconciled by the caller. */
    create(input: CreateTaskInput, options?: RequestOptions): Promise<Task>;
    /** Submits exactly the caller's version without pre-reading or replaying. */
    act(
      taskId: string,
      input: ActTaskInput,
      options?: RequestOptions,
    ): Promise<Task>;
    /** Renews an expired task using the explicit recovery strategy and version. */
    renew(
      taskId: string,
      input: RenewTaskInput,
      options?: RequestOptions,
    ): Promise<Task>;
  };
  comments: {
    /** Appends one comment within the task's optimistic version boundary. */
    create(
      taskId: string,
      input: CreateCommentInput,
      options?: RequestOptions,
    ): Promise<Task>;
    /** Returns the server's folded public projection after editing a comment. */
    edit(
      taskId: string,
      commentId: string,
      input: EditCommentInput,
      options?: RequestOptions,
    ): Promise<Task>;
    /** Returns the server's tombstone projection without reconstructing removed content. */
    delete(
      taskId: string,
      commentId: string,
      input: DeleteCommentInput,
      options?: RequestOptions,
    ): Promise<Task>;
  };
  identities: {
    /** Reads demo identities; this is not a production authentication operation. */
    list(options?: RequestOptions): Promise<Identity[]>;
  };
}
