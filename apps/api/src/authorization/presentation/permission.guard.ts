/** Enforces a handler's fixed permission after the demo identity guard recognizes the actor. */
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import { AppError } from '../../common/application/app-error.js';
import {
  AUTHORIZATION,
  type AuthorizationPort,
} from '../application/ports/authorization.port.js';
import { REQUIRED_PERMISSION } from './require-permission.decorator.js';

@Injectable()
export class PermissionGuard implements CanActivate {
  /** Receives metadata and the narrow authorization decision port. */
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTHORIZATION) private readonly authorization: AuthorizationPort,
  ) {}

  /** Rejects requests whose active demo identity lacks the handler permission. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<unknown>(
      REQUIRED_PERMISSION,
      [context.getHandler(), context.getClass()],
    );
    if (typeof permission !== 'string') return true;
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = request.headers['x-demo-user-id'];
    const actorId = Array.isArray(header) ? header[0] : header;
    if (!actorId)
      throw new AppError('UNKNOWN_IDENTITY', '缺失或未知的演示身份');
    if (
      !(await this.authorization.hasPermission(
        actorId,
        permission as Parameters<AuthorizationPort['hasPermission']>[1],
      ))
    )
      throw new AppError('FORBIDDEN', '当前身份没有执行此操作的权限');
    return true;
  }
}
