/** Coordinates transport-independent liveness and database readiness results. */
import { Inject, Injectable } from '@nestjs/common';

import { AppError } from '../../common/application/app-error.js';
import {
  DATABASE_READINESS,
  type DatabaseReadinessPort,
} from './ports/database-readiness.port.js';

@Injectable()
export class HealthService {
  /** Receives only the database probe port rather than a TypeORM object. */
  constructor(
    @Inject(DATABASE_READINESS)
    private readonly database: DatabaseReadinessPort,
  ) {}

  /** Reports process liveness without consulting external dependencies. */
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Reports readiness only when PostgreSQL responds to the infrastructure probe. */
  async ready(): Promise<{ status: 'ready'; database: 'up' }> {
    if (!(await this.database.isReady())) {
      throw new AppError('DATABASE_NOT_READY', '数据库尚未就绪');
    }
    return { status: 'ready', database: 'up' };
  }
}
