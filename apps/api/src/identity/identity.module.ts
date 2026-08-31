/** Composes demo identity application and infrastructure capabilities for other feature modules. */
import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { IDENTITY_DIRECTORY } from './application/ports/identity-directory.port.js';
import { ListDemoActors } from './application/use-cases/list-demo-actors.js';
import { DemoIdentityDirectory } from './infrastructure/demo-identity-directory.js';

@Module({
  providers: [
    {
      provide: DemoIdentityDirectory,
      useFactory: (dataSource: DataSource) =>
        new DemoIdentityDirectory(dataSource),
      inject: [DataSource],
    },
    { provide: IDENTITY_DIRECTORY, useExisting: DemoIdentityDirectory },
    {
      provide: ListDemoActors,
      useFactory: (identities: DemoIdentityDirectory) =>
        new ListDemoActors(identities),
      inject: [DemoIdentityDirectory],
    },
  ],
  exports: [IDENTITY_DIRECTORY, ListDemoActors],
})
export class IdentityModule {}
