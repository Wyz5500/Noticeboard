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
  TASK_CLOCK,
  type TaskClockPort,
} from '../application/ports/task-clock.port.js';
import {
  TASK_QUERY,
  type TaskQueryPort,
} from '../application/ports/task-query.port.js';
import {
  TASK_TRANSACTION,
  type TaskTransactionPort,
} from '../application/ports/task-transaction.port.js';
import { ActOnTask } from '../application/use-cases/act-on-task.js';
import { AddTaskComment } from '../application/use-cases/add-task-comment.js';
import { CreateTask } from '../application/use-cases/create-task.js';
import { DeleteTaskComment } from '../application/use-cases/delete-task-comment.js';
import { GetTask } from '../application/use-cases/get-task.js';
import { ListTasks } from '../application/use-cases/list-tasks.js';
import { RenewExpiredTask } from '../application/use-cases/renew-expired-task.js';
import { ResetDemoTasks } from '../application/use-cases/reset-demo-tasks.js';
import { PostgresTaskQuery } from '../infrastructure/persistence/postgres-task-query.js';
import { PostgresTaskTransaction } from '../infrastructure/persistence/postgres-task-transaction.js';
import { SystemTaskClock } from '../infrastructure/system-task-clock.js';
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
      provide: TASK_CLOCK,
      useFactory: () =>
        new SystemTaskClock(
          process.env['TASK_BUSINESS_TIME_ZONE'] ?? 'Asia/Shanghai',
          process.env['TASK_CURRENT_DATE_OVERRIDE'],
        ),
    },
    {
      provide: ListTasks,
      useFactory: (
        query: TaskQueryPort,
        clock: TaskClockPort,
        authorization: AuthorizationPort,
      ) => new ListTasks(query, clock, authorization),
      inject: [TASK_QUERY, TASK_CLOCK, AUTHORIZATION],
    },
    {
      provide: GetTask,
      useFactory: (
        query: TaskQueryPort,
        clock: TaskClockPort,
        authorization: AuthorizationPort,
      ) => new GetTask(query, clock, authorization),
      inject: [TASK_QUERY, TASK_CLOCK, AUTHORIZATION],
    },
    {
      provide: CreateTask,
      useFactory: (
        transaction: TaskTransactionPort,
        identities: IdentityDirectoryPort,
        clock: TaskClockPort,
        authorization: AuthorizationPort,
      ) =>
        new CreateTask(
          transaction,
          identities,
          () => `task-${randomUUID()}`,
          clock,
          authorization,
        ),
      inject: [TASK_TRANSACTION, IDENTITY_DIRECTORY, TASK_CLOCK, AUTHORIZATION],
    },
    {
      provide: ActOnTask,
      useFactory: (
        transaction: TaskTransactionPort,
        identities: IdentityDirectoryPort,
        clock: TaskClockPort,
        authorization: AuthorizationPort,
      ) => new ActOnTask(transaction, identities, clock, authorization),
      inject: [TASK_TRANSACTION, IDENTITY_DIRECTORY, TASK_CLOCK, AUTHORIZATION],
    },
    {
      provide: RenewExpiredTask,
      useFactory: (
        transaction: TaskTransactionPort,
        identities: IdentityDirectoryPort,
        clock: TaskClockPort,
        authorization: AuthorizationPort,
      ) => new RenewExpiredTask(transaction, identities, clock, authorization),
      inject: [TASK_TRANSACTION, IDENTITY_DIRECTORY, TASK_CLOCK, AUTHORIZATION],
    },
    {
      provide: AddTaskComment,
      useFactory: (
        transaction: TaskTransactionPort,
        identities: IdentityDirectoryPort,
        authorization: AuthorizationPort,
        clock: TaskClockPort,
      ) =>
        new AddTaskComment(
          transaction,
          identities,
          authorization,
          clock,
          () => `comment-${randomUUID()}`,
        ),
      inject: [TASK_TRANSACTION, IDENTITY_DIRECTORY, AUTHORIZATION, TASK_CLOCK],
    },
    {
      provide: DeleteTaskComment,
      useFactory: (
        transaction: TaskTransactionPort,
        identities: IdentityDirectoryPort,
        authorization: AuthorizationPort,
        clock: TaskClockPort,
      ) => new DeleteTaskComment(transaction, identities, authorization, clock),
      inject: [TASK_TRANSACTION, IDENTITY_DIRECTORY, AUTHORIZATION, TASK_CLOCK],
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
