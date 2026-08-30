/** Composes demo identity application and infrastructure capabilities for other feature modules. */
import { Module } from '@nestjs/common';

import { IDENTITY_DIRECTORY } from './application/ports/identity-directory.port.js';
import { ListDemoActors } from './application/use-cases/list-demo-actors.js';
import { DemoIdentityDirectory } from './infrastructure/demo-identity-directory.js';

@Module({
  providers: [
    DemoIdentityDirectory,
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
