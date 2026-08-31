/** Carries authorization-domain failures without depending on transport or persistence. */

export type AuthorizationDomainErrorCode = 'INVALID_ROLE';

export class AuthorizationDomainError extends Error {
  /** Creates a stable role-domain failure for application and presentation adapters. */
  constructor(
    public readonly code: AuthorizationDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthorizationDomainError';
  }
}
