/** Carries stable domain failure codes without leaking transport-specific status codes. */

export type DomainErrorCode = 'INVALID_TASK' | 'ACTION_FORBIDDEN';

export class DomainError extends Error {
  /** Creates a domain failure that presentation adapters can map independently. */
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
