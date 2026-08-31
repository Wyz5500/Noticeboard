/** Composes authorization decisions, role management use cases, and protected admin HTTP routes. */
import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IdentityModule } from '../identity/identity.module.js';

import { AUTHORIZATION } from './application/ports/authorization.port.js';
import { AUTHORIZATION_MANAGEMENT } from './application/ports/authorization-management.port.js';
import {
  CreateAdminRole,
  CreateAdminUser,
  DeleteAdminRole,
  DeleteAdminUser,
  GetAdminOverview,
  RestoreAdminRole,
  RestoreAdminUser,
  UpdateAdminRole,
  UpdateAdminUser,
} from './application/use-cases/admin-use-cases.js';
import { PostgresAuthorization } from './infrastructure/postgres-authorization.js';
import { AdminController } from './presentation/admin.controller.js';
import { PermissionGuard } from './presentation/permission.guard.js';
import { DemoUserGuard } from '../identity/presentation/demo-user.guard.js';

@Module({
  imports: [IdentityModule],
  controllers: [AdminController],
  providers: [
    DemoUserGuard,
    PermissionGuard,
    {
      provide: PostgresAuthorization,
      useFactory: (dataSource: DataSource) =>
        new PostgresAuthorization(dataSource),
      inject: [DataSource],
    },
    { provide: AUTHORIZATION, useExisting: PostgresAuthorization },
    { provide: AUTHORIZATION_MANAGEMENT, useExisting: PostgresAuthorization },
    {
      provide: GetAdminOverview,
      useFactory: (management: PostgresAuthorization) =>
        new GetAdminOverview(management),
      inject: [AUTHORIZATION_MANAGEMENT],
    },
    {
      provide: CreateAdminUser,
      useFactory: (management: PostgresAuthorization) =>
        new CreateAdminUser(management),
      inject: [AUTHORIZATION_MANAGEMENT],
    },
    {
      provide: UpdateAdminUser,
      useFactory: (management: PostgresAuthorization) =>
        new UpdateAdminUser(management),
      inject: [AUTHORIZATION_MANAGEMENT],
    },
    {
      provide: DeleteAdminUser,
      useFactory: (management: PostgresAuthorization) =>
        new DeleteAdminUser(management),
      inject: [AUTHORIZATION_MANAGEMENT],
    },
    {
      provide: RestoreAdminUser,
      useFactory: (management: PostgresAuthorization) =>
        new RestoreAdminUser(management),
      inject: [AUTHORIZATION_MANAGEMENT],
    },
    {
      provide: CreateAdminRole,
      useFactory: (management: PostgresAuthorization) =>
        new CreateAdminRole(management),
      inject: [AUTHORIZATION_MANAGEMENT],
    },
    {
      provide: UpdateAdminRole,
      useFactory: (management: PostgresAuthorization) =>
        new UpdateAdminRole(management),
      inject: [AUTHORIZATION_MANAGEMENT],
    },
    {
      provide: DeleteAdminRole,
      useFactory: (management: PostgresAuthorization) =>
        new DeleteAdminRole(management),
      inject: [AUTHORIZATION_MANAGEMENT],
    },
    {
      provide: RestoreAdminRole,
      useFactory: (management: PostgresAuthorization) =>
        new RestoreAdminRole(management),
      inject: [AUTHORIZATION_MANAGEMENT],
    },
  ],
  exports: [AUTHORIZATION, PermissionGuard],
})
export class AuthorizationModule {}
