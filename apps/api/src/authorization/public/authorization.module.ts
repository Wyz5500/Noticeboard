/** Composes authorization internals behind the Feature's public Nest integration boundary. */
import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  IDENTITY_ACCOUNT_PERSISTENCE,
  type IdentityAccountPersistence,
} from '../../identity/public/persistence.js';
import { IdentityModule } from '../../identity/public/identity.module.js';
import { AUTHORIZATION_MANAGEMENT } from '../application/ports/authorization-management.port.js';
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
} from '../application/use-cases/admin-use-cases.js';
import { PostgresAuthorization } from '../infrastructure/postgres-authorization.js';
import { AdminController } from '../presentation/admin.controller.js';
import { PermissionGuard } from '../presentation/permission.guard.js';
import { AUTHORIZATION } from './authorization.port.js';

@Module({
  imports: [IdentityModule],
  controllers: [AdminController],
  providers: [
    PermissionGuard,
    {
      provide: PostgresAuthorization,
      useFactory: (
        dataSource: DataSource,
        accounts: IdentityAccountPersistence,
      ) => new PostgresAuthorization(dataSource, accounts),
      inject: [DataSource, IDENTITY_ACCOUNT_PERSISTENCE],
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
