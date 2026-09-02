/** Carries authorization-domain failures without depending on transport or persistence. */
import { CodedDomainError } from '../../common/domain/domain-error.js';

export type AuthorizationDomainErrorCode = 'INVALID_ROLE';

export class AuthorizationDomainError extends CodedDomainError {
  /** Creates a stable role-domain failure for application and presentation adapters. */
  constructor(code: AuthorizationDomainErrorCode, message: string) {
    super(code, message);
    this.name = 'AuthorizationDomainError';
  }
}
