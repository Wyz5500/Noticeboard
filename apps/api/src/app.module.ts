/** Composes the modular monolith while keeping feature internals behind Nest module boundaries. */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { loadRuntimeConfig } from './common/infrastructure/config/runtime-config.js';
import { HealthModule } from './health/health.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { postgresDataSourceOptions } from './tasks/infrastructure/persistence/data-source.js';
import { TasksModule } from './tasks/tasks.module.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () =>
        postgresDataSourceOptions(loadRuntimeConfig().databaseUrl),
    }),
    IdentityModule,
    TasksModule,
    HealthModule,
  ],
})
export class AppModule {}
