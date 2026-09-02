/** Composes identity internals behind the Feature's public Nest integration boundary. */
import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ListDemoActors } from '../application/use-cases/list-demo-actors.js';
import { DemoIdentityDirectory } from '../infrastructure/demo-identity-directory.js';
import { PostgresAccountPersistence } from '../infrastructure/persistence/postgres-account-persistence.js';
import { DemoController } from '../presentation/demo.controller.js';
import { DemoUserGuard } from '../presentation/demo-user.guard.js';
import { IDENTITY_DIRECTORY } from './identity-directory.port.js';
import {
  IDENTITY_ACCOUNT_PERSISTENCE,
  type IdentityAccountPersistence,
} from './persistence.js';

@Module({
  controllers: [DemoController],
  providers: [
    PostgresAccountPersistence,
    {
      provide: IDENTITY_ACCOUNT_PERSISTENCE,
      useExisting: PostgresAccountPersistence,
    },
    {
      provide: DemoIdentityDirectory,
      useFactory: (
        dataSource: DataSource,
        accounts: IdentityAccountPersistence,
      ) => new DemoIdentityDirectory(dataSource, accounts),
      inject: [DataSource, IDENTITY_ACCOUNT_PERSISTENCE],
    },
    { provide: IDENTITY_DIRECTORY, useExisting: DemoIdentityDirectory },
    {
      provide: ListDemoActors,
      useFactory: (identities: DemoIdentityDirectory) =>
        new ListDemoActors(identities),
      inject: [DemoIdentityDirectory],
    },
    DemoUserGuard,
  ],
  exports: [IDENTITY_DIRECTORY, IDENTITY_ACCOUNT_PERSISTENCE, DemoUserGuard],
})
export class IdentityModule {}
