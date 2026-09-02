/** Composes health internals behind the Feature's public Nest integration boundary. */
import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { HealthService } from '../application/health.service.js';
import { DATABASE_READINESS } from '../application/ports/database-readiness.port.js';
import { TypeOrmDatabaseReadiness } from '../infrastructure/typeorm-database-readiness.js';
import { HealthController } from '../presentation/health.controller.js';

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: DATABASE_READINESS,
      useFactory: (dataSource: DataSource) =>
        new TypeOrmDatabaseReadiness(dataSource),
      inject: [DataSource],
    },
    HealthService,
  ],
})
export class HealthModule {}
