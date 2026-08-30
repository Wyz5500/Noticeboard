/** Composes task use cases with PostgreSQL ports and demo identity capabilities. */
import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';

import {
  IDENTITY_DIRECTORY,
  type IdentityDirectoryPort,
} from '../identity/application/ports/identity-directory.port.js';
import { IdentityModule } from '../identity/identity.module.js';
import { DemoController } from '../identity/presentation/demo.controller.js';
import { DemoUserGuard } from '../identity/presentation/demo-user.guard.js';
import {
  TASK_QUERY,
  type TaskQueryPort,
} from './application/ports/task-query.port.js';
import {
  TASK_TRANSACTION,
  type TaskTransactionPort,
} from './application/ports/task-transaction.port.js';
import { ActOnTask } from './application/use-cases/act-on-task.js';
import { CreateTask } from './application/use-cases/create-task.js';
import { GetTask } from './application/use-cases/get-task.js';
import { ListTasks } from './application/use-cases/list-tasks.js';
import { ResetDemoTasks } from './application/use-cases/reset-demo-tasks.js';
import { PostgresTaskQuery } from './infrastructure/persistence/postgres-task-query.js';
import { PostgresTaskTransaction } from './infrastructure/persistence/postgres-task-transaction.js';
import { TasksController } from './presentation/tasks.controller.js';

@Module({
  imports: [IdentityModule],
  controllers: [TasksController, DemoController],
  providers: [
    DemoUserGuard,
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
      useFactory: (query: TaskQueryPort) => new ListTasks(query),
      inject: [TASK_QUERY],
    },
    {
      provide: GetTask,
      useFactory: (query: TaskQueryPort) => new GetTask(query),
      inject: [TASK_QUERY],
    },
    {
      provide: CreateTask,
      useFactory: (
        transaction: TaskTransactionPort,
        identities: IdentityDirectoryPort,
      ) =>
        new CreateTask(
          transaction,
          identities,
          () => `task-${randomUUID()}`,
          () => new Date().toISOString(),
        ),
      inject: [TASK_TRANSACTION, IDENTITY_DIRECTORY],
    },
    {
      provide: ActOnTask,
      useFactory: (
        transaction: TaskTransactionPort,
        identities: IdentityDirectoryPort,
      ) =>
        new ActOnTask(transaction, identities, () => new Date().toISOString()),
      inject: [TASK_TRANSACTION, IDENTITY_DIRECTORY],
    },
    {
      provide: ResetDemoTasks,
      useFactory: (
        transaction: TaskTransactionPort,
        identities: IdentityDirectoryPort,
      ) => new ResetDemoTasks(transaction, identities),
      inject: [TASK_TRANSACTION, IDENTITY_DIRECTORY],
    },
  ],
  exports: [ListTasks, GetTask, CreateTask, ActOnTask, ResetDemoTasks],
})
export class TasksModule {}
