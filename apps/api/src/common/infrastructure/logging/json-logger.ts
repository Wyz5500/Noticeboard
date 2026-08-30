/** Emits one structured JSON record per Nest lifecycle and application log event. */
import type { LoggerService } from '@nestjs/common';

export class JsonLogger implements LoggerService {
  /** Writes an informational structured record. */
  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  /** Writes an error record with an optional stack trace. */
  error(message: unknown, stack?: string, context?: string): void {
    this.write('error', message, context, stack);
  }

  /** Writes a warning structured record. */
  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  /** Writes a debug structured record when Nest requests it. */
  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  /** Writes a verbose structured record when Nest requests it. */
  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  /** Writes a fatal structured record before process termination. */
  fatal(message: unknown, context?: string): void {
    this.write('fatal', message, context);
  }

  /** Serializes values safely to the stream matching their severity. */
  private write(
    level: string,
    message: unknown,
    context?: string,
    stack?: string,
  ): void {
    const record = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      ...(context ? { context } : {}),
      ...(stack ? { stack } : {}),
    });
    if (level === 'error' || level === 'fatal') console.error(record);
    else if (level === 'warn') console.warn(record);
    else console.log(record);
  }
}
