/** Maps application, domain, validation, and unexpected failures to one HTTP error envelope. */
import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
  type LoggerService,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '../application/app-error.js';
import { DomainError } from '../../tasks/domain/domain-error.js';

interface ErrorDescription {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

/** Converts known failures into stable status, code, and message triples. */
function describeError(exception: unknown): ErrorDescription {
  if (exception instanceof AppError) {
    const statusByCode = {
      UNKNOWN_IDENTITY: HttpStatus.UNAUTHORIZED,
      TASK_NOT_FOUND: HttpStatus.NOT_FOUND,
      CONFLICT: HttpStatus.CONFLICT,
      DATABASE_NOT_READY: HttpStatus.SERVICE_UNAVAILABLE,
    } as const;
    return {
      status: statusByCode[exception.code],
      code: exception.code,
      message: exception.message,
    };
  }
  if (exception instanceof DomainError) {
    const status =
      exception.code === 'ACTION_FORBIDDEN'
        ? HttpStatus.FORBIDDEN
        : HttpStatus.BAD_REQUEST;
    return { status, code: exception.code, message: exception.message };
  }
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    const status = exception.getStatus();
    if (typeof response === 'object' && response && 'message' in response) {
      const rawMessage = response.message;
      return {
        status,
        code: status === 400 ? 'VALIDATION_FAILED' : 'HTTP_ERROR',
        message: Array.isArray(rawMessage)
          ? '请求数据校验失败'
          : String(rawMessage),
        details: Array.isArray(rawMessage) ? rawMessage : undefined,
      };
    }
    return {
      status,
      code: 'HTTP_ERROR',
      message: typeof response === 'string' ? response : '请求失败',
    };
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message: '服务器内部错误',
  };
}

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  /** Receives an overridable error logger while defaulting to Nest's configured logger. */
  constructor(
    private readonly logger: Pick<LoggerService, 'error'> = new Logger(
      ApiErrorFilter.name,
    ),
  ) {}

  /** Serializes a stable error envelope while withholding internal exception details. */
  catch(exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<FastifyRequest>();
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const error = describeError(exception);
    if (error.code === 'INTERNAL_ERROR') {
      this.logger.error(
        exception instanceof Error ? exception.message : 'Unknown exception',
        exception instanceof Error ? exception.stack : undefined,
        ApiErrorFilter.name,
      );
    }
    void reply.status(error.status).send({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
