/** Defines the explicit transaction boundary used by task command use cases. */
import type { TaskRepositoryPort } from './task-repository.port.js';

export interface TaskTransactionPort {
  /** Runs work with only the transaction-scoped task repository capability. */
  run<T>(work: (repository: TaskRepositoryPort) => Promise<T>): Promise<T>;
}

export const TASK_TRANSACTION = Symbol('TASK_TRANSACTION');
