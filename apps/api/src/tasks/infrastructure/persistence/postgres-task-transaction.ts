/** Adapts TypeORM transactions to the application task-only transaction capability. */
import type { DataSource } from 'typeorm';

import type { TaskRepositoryPort } from '../../application/ports/task-repository.port.js';
import type { TaskTransactionPort } from '../../application/ports/task-transaction.port.js';
import { PostgresTaskRepository } from './postgres-task-repository.js';

export class PostgresTaskTransaction implements TaskTransactionPort {
  /** Binds transaction execution to the shared application DataSource. */
  constructor(private readonly dataSource: DataSource) {}

  /** Runs work with one repository backed by the same underlying database transaction. */
  run<T>(work: (repository: TaskRepositoryPort) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(async (manager) =>
      work(new PostgresTaskRepository(manager)),
    );
  }
}
