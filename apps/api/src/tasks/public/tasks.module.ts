/** Composes task internals behind the Feature's public Nest integration boundary. */
import { Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

import {
  AUTHORIZATION,
  type AuthorizationPort,
} from '../../authorization/public/authorization.port.js';
import { AuthorizationModule } from '../../authorization/public/authorization.module.js';
import {
  IDENTITY_DIRECTORY,
  type IdentityDirectoryPort,
} from '../../identity/public/identity-directory.port.js';
import { IdentityModule } from '../../identity/public/identity.module.js';
import {
  TASK_QUERY,
  type TaskQueryPort,
} from '../application/ports/task-query.port.js';
import {
  TASK_TRANSACTION,
  type TaskTransactionPort,
} from '../application/ports/task-transaction.port.js';
import { ActOnTask } from '../application/use-cases/act-on-task.js';
import { CreateTask } from '../application/use-cases/create-task.js';
import { GetTask } from '../application/use-cases/get-task.js';
import { ListTasks } from '../application/use-cases/list-tasks.js';
import { ResetDemoTasks } from '../application/use-cases/reset-demo-tasks.js';
import { PostgresTaskQuery } from '../infrastructure/persistence/postgres-task-query.js';
import { PostgresTaskTransaction } from '../infrastructure/persistence/postgres-task-transaction.js';
import { DemoTasksController } from '../presentation/demo-tasks.controller.js';
import { TasksController } from '../presentation/tasks.controller.js';

@Module({
  imports: [IdentityModule, AuthorizationModule],
  controllers: [TasksController, DemoTasksController],
  providers: [
    {
      provide: TASK_QUERY,
      useFactory: (dataSource: DataSource) => new PostgresTaskQuery(dataSource),
      inject: [DataSource],
    },
    {
      provide: TASK_TRANSACTION,
      useFactory: (dataSource: DataSource) =>
        new PostgresTaskTransaction(dataSource),
      inject: [DataSource],
    },
    {
      provide: ListTasks,
      useFactory: (query: TaskQueryPort, authorization: AuthorizationPort) =>
        new ListTasks(query, authorization),
      inject: [TASK_QUERY, AUTHORIZATION],
    },
    {
      provide: GetTask,
      useFactory: (query: TaskQueryPort, authorization: AuthorizationPort) =>
        new GetTask(query, authorization),
      inject: [TASK_QUERY, AUTHORIZATION],
    },
    {
      provide: CreateTask,
      useFactory: (
        transaction: TaskTransactionPort,
        identities: IdentityDirectoryPort,
        authorization: AuthorizationPort,
      ) =>
        new CreateTask(
          transaction,
          identities,
          () => `task-${randomUUID()}`,
          () => new Date().toISOString(),
          authorization,
        ),
      inject: [TASK_TRANSACTION, IDENTITY_DIRECTORY, AUTHORIZATION],
    },
    {
      provide: ActOnTask,
      useFactory: (
        transaction: TaskTransactionPort,
        identities: IdentityDirectoryPort,
        authorization: AuthorizationPort,
      ) =>
        new ActOnTask(
          transaction,
          identities,
          () => new Date().toISOString(),
          authorization,
        ),
      inject: [TASK_TRANSACTION, IDENTITY_DIRECTORY, AUTHORIZATION],
    },
    {
      provide: ResetDemoTasks,
      useFactory: (
        transaction: TaskTransactionPort,
        identities: IdentityDirectoryPort,
        authorization: AuthorizationPort,
      ) => new ResetDemoTasks(transaction, identities, authorization),
      inject: [TASK_TRANSACTION, IDENTITY_DIRECTORY, AUTHORIZATION],
    },
  ],
})
export class TasksModule {}
