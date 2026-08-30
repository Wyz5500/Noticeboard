/** Implements the replaceable demo identity directory with fixed non-secret actors. */
import type { IdentityDirectoryPort } from '../application/ports/identity-directory.port.js';
import { DEMO_ACTORS } from '../domain/demo-actors.js';
import type { Actor } from '../../tasks/domain/task.types.js';

export class DemoIdentityDirectory implements IdentityDirectoryPort {
  /** Lists detached demo actors in the stable UI order. */
  list(): Promise<Actor[]> {
    return Promise.resolve(DEMO_ACTORS.map((actor) => ({ ...actor })));
  }

  /** Resolves an exact demo actor without selecting a fallback. */
  findById(id: string): Promise<Actor | null> {
    const actor = DEMO_ACTORS.find((candidate) => candidate.id === id);
    return Promise.resolve(actor ? { ...actor } : null);
  }
}
