/** Public errors preserve remote diagnostics while separating HTTP, network and protocol failures. */
export interface ApiErrorMetadata {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  path: string;
  timestamp: string;
}

export class NoticeboardApiError extends Error {
  readonly kind = 'api';
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly path: string;
  readonly timestamp: string;

  /** Preserves the server's safe error envelope, including unrecognized machine codes. */
  constructor(metadata: ApiErrorMetadata) {
    super(metadata.message);
    this.name = 'NoticeboardApiError';
    this.status = metadata.status;
    this.code = metadata.code;
    if (metadata.details !== undefined) this.details = metadata.details;
    this.path = metadata.path;
    this.timestamp = metadata.timestamp;
  }
}

export class NoticeboardNetworkError extends Error {
  readonly kind = 'network';

  /** Retains the original connection or cancellation cause without replaying a request. */
  constructor(
    readonly reason: 'network' | 'aborted',
    cause: unknown,
  ) {
    super(reason === 'aborted' ? '请求已取消' : '网络请求失败', { cause });
    this.name = 'NoticeboardNetworkError';
  }
}

export class NoticeboardProtocolError extends Error {
  readonly kind = 'protocol';

  /** Reports invalid remote responses without including raw response bodies in the message. */
  constructor(
    message: string,
    readonly status: number | undefined,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NoticeboardProtocolError';
  }
}
