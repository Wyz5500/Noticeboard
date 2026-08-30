/** Lists demo identities through an application-owned capability. */
import type { Actor } from '../../../tasks/domain/task.types.js';
import type { IdentityDirectoryPort } from '../ports/identity-directory.port.js';

export class ListDemoActors {
  /** Receives only the identity directory port needed by this query. */
  constructor(private readonly identities: IdentityDirectoryPort) {}

  /** Returns detached demo identity values in display order. */
  execute(): Promise<Actor[]> {
    return this.identities.list();
  }
}
