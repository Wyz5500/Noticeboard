/** Defines application failures independently from HTTP and persistence implementations. */

export type AppErrorCode =
  'UNKNOWN_IDENTITY' | 'TASK_NOT_FOUND' | 'CONFLICT' | 'DATABASE_NOT_READY';

export class AppError extends Error {
  /** Creates an application failure with a stable mapping code. */
  constructor(
    public readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
