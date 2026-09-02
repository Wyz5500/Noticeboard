/** Provides a framework-free base for coded domain failures shared with error adapters. */

export class CodedDomainError extends Error {
  /** Creates a domain failure without assigning transport semantics. */
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CodedDomainError';
  }
}
