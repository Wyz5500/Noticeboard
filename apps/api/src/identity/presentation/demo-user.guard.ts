/** Enforces the demo-only identity header on mutating endpoints. */
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { AppError } from '../../common/application/app-error.js';
import {
  IDENTITY_DIRECTORY,
  type IdentityDirectoryPort,
} from '../application/ports/identity-directory.port.js';

@Injectable()
export class DemoUserGuard implements CanActivate {
  /** Receives the replaceable identity directory adapter. */
  constructor(
    @Inject(IDENTITY_DIRECTORY)
    private readonly identities: IdentityDirectoryPort,
  ) {}

  /** Allows only a single recognized X-Demo-User-Id header value. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = request.headers['x-demo-user-id'];
    const actorId = Array.isArray(header) ? header[0] : header;
    if (!actorId || !(await this.identities.findById(actorId))) {
      throw new AppError('UNKNOWN_IDENTITY', '缺失或未知的演示身份');
    }
    return true;
  }
}
