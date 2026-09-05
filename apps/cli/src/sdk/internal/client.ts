/** Adapts generated operations to the handwritten SDK contract. */
import {
  NoticeboardApiError,
  NoticeboardNetworkError,
  NoticeboardProtocolError,
} from '../errors.js';
import type {
  NoticeboardClient,
  NoticeboardClientOptions,
  RequestOptions,
} from '../options.js';
import {
  getTask,
  getAdminOverview,
  listDemoUsers,
  listTasks,
  createTask,
  actOnTask,
  renewExpiredTask,
  createTaskComment,
  editTaskComment,
  deleteTaskComment,
} from './generated/transport.js';
import { array } from './decoders.js';
import type { Decoder } from './decoders.js';
import {
  decodeAdminOverview,
  decodeError,
  decodeIdentity,
  decodeTask,
} from './read-contracts.js';

type Operation = (
  options: RequestInit,
  fetch: typeof globalThis.fetch,
) => Promise<{ status: number; data: unknown }>;

/** Rejects ambiguous destinations and retains an optional reverse-proxy path prefix. */
function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.href.includes('?') ||
    url.href.includes('#')
  ) {
    throw new TypeError(
      'baseUrl 必须是无凭据、查询或 fragment 的 HTTP(S) 地址',
    );
  }
  return url.href.replace(/\/+$/, '');
}

/** Converts validation failures into protocol errors with the original response status. */
function decodeResponse<T>(
  decode: Decoder<T>,
  value: unknown,
  status: number,
): T {
  try {
    return decode(value, '$');
  } catch (cause) {
    throw new NoticeboardProtocolError(
      cause instanceof Error ? cause.message : '响应不符合合同',
      status,
      { cause },
    );
  }
}

/** Recognizes cancellation only from the caller's effective signal, retaining its original reason. */
function networkError(
  cause: unknown,
  signal: AbortSignal | undefined,
): NoticeboardNetworkError {
  return new NoticeboardNetworkError(
    signal?.aborted ? 'aborted' : 'network',
    signal?.aborted ? signal.reason : cause,
  );
}

/** Constructs an isolated HTTP client without reading process or filesystem configuration. */
export function createNoticeboardClient(
  options: NoticeboardClientOptions,
): NoticeboardClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetch = options.fetch ?? globalThis.fetch;
  const getHeaders = options.getHeaders;
  const defaultSignal = options.signal;

  /** Keeps HTTP context local to one call, including asynchronous providers and body parsing failures. */
  async function requestResource<T>(
    operation: Operation,
    decode: Decoder<T>,
    request: RequestOptions = {},
    successStatus = 200,
  ): Promise<T> {
    const signals = [defaultSignal, request.signal].filter(
      (signal): signal is AbortSignal => signal !== undefined,
    );
    const signal = signals.length ? AbortSignal.any(signals) : undefined;
    if (signal?.aborted) throw networkError(signal.reason, signal);
    const headers = new Headers(await getHeaders?.());
    if (signal?.aborted) throw networkError(signal.reason, signal);
    let status: number | undefined;
    const boundFetch: typeof globalThis.fetch = async (input, init) => {
      try {
        const path = input instanceof Request ? input.url : input.toString();
        const response = await fetch(`${baseUrl}${path}`, init);
        status = response.status;
        return response;
      } catch (cause) {
        throw networkError(cause, signal);
      }
    };
    let response: Awaited<ReturnType<Operation>>;
    try {
      response = await operation(
        { headers, ...(signal ? { signal } : {}) },
        boundFetch,
      );
    } catch (cause) {
      if (cause instanceof NoticeboardNetworkError) throw cause;
      if (cause instanceof SyntaxError)
        throw new NoticeboardProtocolError('响应不是有效 JSON', status, {
          cause,
        });
      throw networkError(cause, signal);
    }
    if (response.status >= 400) {
      const envelope = decodeResponse(
        decodeError,
        response.data,
        response.status,
      );
      throw new NoticeboardApiError({
        ...envelope.error,
        status: response.status,
        path: envelope.path,
        timestamp: envelope.timestamp,
      });
    }
    if (response.status !== successStatus)
      throw new NoticeboardProtocolError(
        '响应状态不符合操作合同',
        response.status,
      );
    return decodeResponse(decode, response.data, response.status);
  }

  return {
    admin: {
      /** Uses the existing protected overview operation with the shared read error contract. */
      overview: (request) =>
        requestResource(getAdminOverview, decodeAdminOverview, request),
    },
    tasks: {
      /** Creation alone uses the existing HTTP 201 contract. */
      create: (input, request) =>
        requestResource(
          (init, fetch) => createTask(input, init, fetch),
          decodeTask,
          request,
          201,
        ),
      /** Sends the explicit expected version without additional reads. */
      act: (taskId, input, request) =>
        requestResource(
          (init, fetch) => actOnTask(taskId, input, init, fetch),
          decodeTask,
          request,
        ),
      /** Leaves renewal eligibility and dates to the server. */
      renew: (taskId, input, request) =>
        requestResource(
          (init, fetch) => renewExpiredTask(taskId, input, init, fetch),
          decodeTask,
          request,
        ),
      /** Uses the complete list endpoint with no client-side query semantics. */
      list: (request) => requestResource(listTasks, array(decodeTask), request),
      /** Lets the generated operation encode the path parameter exactly once. */
      get: (taskId, request) =>
        requestResource(
          (init, fetch) => getTask(taskId, init, fetch),
          decodeTask,
          request,
        ),
    },
    comments: {
      /** Uses generated encoding and a JSON body for all comment writes, including DELETE. */
      create: (taskId, input, request) =>
        requestResource(
          (init, fetch) => createTaskComment(taskId, input, init, fetch),
          decodeTask,
          request,
        ),
      /** Keeps edits within the task aggregate version boundary. */
      edit: (taskId, commentId, input, request) =>
        requestResource(
          (init, fetch) =>
            editTaskComment(taskId, commentId, input, init, fetch),
          decodeTask,
          request,
        ),
      /** Trusts server tombstones and never replays uncertain deletion outcomes. */
      delete: (taskId, commentId, input, request) =>
        requestResource(
          (init, fetch) =>
            deleteTaskComment(taskId, commentId, input, init, fetch),
          decodeTask,
          request,
        ),
    },
    identities: {
      /** Exposes only the demo directory and does not persist a selected identity. */
      list: (request) =>
        requestResource(listDemoUsers, array(decodeIdentity), request),
    },
  };
}
