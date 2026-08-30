/** Defines aggregate-oriented persistence semantics for task commands. */
import type { Task } from '../../domain/task.js';

export interface TaskRepositoryPort {
  /** Restores an aggregate by identifier within the current transaction. */
  findById(id: string): Promise<Task | null>;

  /** Inserts a newly created aggregate and its initial event. */
  insert(task: Task): Promise<void>;

  /** Persists a mutation only if the stored optimistic version matches. */
  save(task: Task, expectedVersion: number): Promise<void>;

  /** Replaces all task aggregates with the deterministic demo seed set. */
  replaceAll(tasks: Task[]): Promise<void>;
}
