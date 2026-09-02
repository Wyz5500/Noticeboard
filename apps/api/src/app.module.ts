/** Composes the modular monolith while keeping feature internals behind Nest module boundaries. */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { loadRuntimeConfig } from './common/infrastructure/config/runtime-config.js';
import { postgresDataSourceOptions } from './database.js';
import { HealthModule } from './health/public/health.module.js';
import { AuthorizationModule } from './authorization/public/authorization.module.js';
import { IdentityModule } from './identity/public/identity.module.js';
import { TasksModule } from './tasks/public/tasks.module.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () =>
        postgresDataSourceOptions(loadRuntimeConfig().databaseUrl),
    }),
    IdentityModule,
    AuthorizationModule,
    TasksModule,
    HealthModule,
  ],
})
export class AppModule {}
