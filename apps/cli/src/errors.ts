/** Maps local and SDK failures into the stable CLI error and exit contract. */
import {
  NoticeboardApiError,
  NoticeboardNetworkError,
  NoticeboardProtocolError,
} from './sdk/index.js';

export class CliError extends Error {
  /** Carries safe local diagnostics without exposing configuration contents. */
  constructor(
    readonly kind: 'usage' | 'config',
    message: string,
    readonly exitCode = 64,
  ) {
    super(message);
  }
}

export class WriteFailure extends Error {
  /** Attaches CLI reconciliation context without altering the original SDK error. */
  constructor(
    cause: unknown,
    readonly taskId: string | undefined,
    readonly expectedVersion: number | undefined,
  ) {
    super('写操作失败', { cause });
  }
}

export class ManagementWriteFailure extends Error {
  /** Carries resource reconciliation context without inventing an optimistic task version. */
  constructor(
    cause: unknown,
    readonly resource: 'user' | 'role',
    readonly id: string | undefined,
  ) {
    super('管理写操作失败', { cause });
  }
}

/** Keeps protocol classification ahead of HTTP status and preserves open API error codes. */
export function describeError(cause: unknown): {
  error: Record<string, unknown>;
  meta: { exitCode: number; expectedVersion?: number };
} {
  if (cause instanceof ManagementWriteFailure) {
    const failure = describeError(cause.cause);
    const read =
      cause.id === undefined
        ? `${cause.resource} list 查找并通过 ${cause.resource} get`
        : `${cause.resource} get`;
    if (failure.error.status === 409)
      failure.error.hint = `请使用 ${read} 读取服务器状态后再决定操作`;
    if (failure.error.kind === 'network' || failure.error.kind === 'protocol')
      failure.error.hint = `写入可能已提交；请使用 ${read} 核对服务器状态，不要直接重复操作`;
    return failure;
  }
  if (cause instanceof WriteFailure) {
    const failure = describeError(cause.cause);
    if (cause.expectedVersion !== undefined)
      failure.meta.expectedVersion = cause.expectedVersion;
    if (failure.error.status === 409)
      failure.error.hint = `本次 expectedVersion=${cause.expectedVersion}；请重新执行 task get 读取服务器状态后再决定操作`;
    if (failure.error.kind === 'network' || failure.error.kind === 'protocol')
      failure.error.hint = cause.taskId
        ? '写入可能已提交；请使用 task get 读取服务器状态核对，不要直接重复操作'
        : '任务可能已提交；请使用 task list 查找并通过 task get 核对，不要直接重复创建';
    return failure;
  }
  if (cause instanceof CliError)
    return {
      error: { kind: cause.kind, message: cause.message },
      meta: { exitCode: cause.exitCode },
    };
  if (cause instanceof NoticeboardApiError) {
    const status = cause.status;
    const exitCode =
      status === 400
        ? 64
        : status === 401 || status === 403
          ? 77
          : status === 404
            ? 66
            : status === 409 || status === 429
              ? 75
              : status >= 500
                ? 69
                : 1;
    return {
      error: {
        kind: 'api',
        code: cause.code,
        message: cause.message,
        status,
        details: cause.details,
        path: cause.path,
        timestamp: cause.timestamp,
        ...(status === 401
          ? { hint: '请使用 identity list 查看身份，并通过 identity use 选择' }
          : {}),
      },
      meta: { exitCode },
    };
  }
  if (cause instanceof NoticeboardProtocolError)
    return {
      error: { kind: 'protocol', message: cause.message, status: cause.status },
      meta: { exitCode: 65 },
    };
  if (cause instanceof NoticeboardNetworkError)
    return {
      error: {
        kind: 'network',
        message:
          cause.reason === 'aborted'
            ? '请求已取消或超时，请重新读取服务器状态'
            : cause.message,
        reason: cause.reason,
      },
      meta: { exitCode: 69 },
    };
  return {
    error: { kind: 'internal', message: 'CLI 运行失败' },
    meta: { exitCode: 1 },
  };
}
