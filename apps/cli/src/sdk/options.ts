/** Public construction and cancellation contracts; SDK configuration is supplied entirely by callers. */
import type { Identity, Task } from './models.js';

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
  tasks: {
    /** Reads the complete server-ordered list without filtering, caching or retrying. */
    list(options?: RequestOptions): Promise<Task[]>;
    /** Reads one task and its public timeline using a path-encoded identifier. */
    get(taskId: string, options?: RequestOptions): Promise<Task>;
  };
  identities: {
    /** Reads demo identities; this is not a production authentication operation. */
    list(options?: RequestOptions): Promise<Identity[]>;
  };
}
