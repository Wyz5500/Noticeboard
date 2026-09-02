/** Carries stable domain failure codes without leaking transport-specific status codes. */
import { CodedDomainError } from '../../common/domain/domain-error.js';

export type DomainErrorCode =
  | 'INVALID_TASK'
  | 'ACTION_FORBIDDEN'
  | 'INVALID_COMMENT'
  | 'COMMENT_NOT_FOUND'
  | 'COMMENT_FORBIDDEN'
  | 'COMMENT_CONFLICT';

export class DomainError extends CodedDomainError {
  /** Creates a domain failure that presentation adapters can map independently. */
  constructor(code: DomainErrorCode, message: string) {
    super(code, message);
    this.name = 'DomainError';
  }
}
