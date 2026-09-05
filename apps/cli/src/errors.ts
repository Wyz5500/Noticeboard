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

/** Keeps protocol classification ahead of HTTP status and preserves open API error codes. */
export function describeError(cause: unknown): {
  error: Record<string, unknown>;
  meta: { exitCode: number };
} {
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
