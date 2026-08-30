/** Defines the identity capability consumed by demo application use cases. */
import type { Actor } from '../../../tasks/domain/task.types.js';

export interface IdentityDirectoryPort {
  /** Lists available demo actors in stable display order. */
  list(): Promise<Actor[]>;

  /** Resolves an exact identity without applying a default. */
  findById(id: string): Promise<Actor | null>;
}

export const IDENTITY_DIRECTORY = Symbol('IDENTITY_DIRECTORY');
