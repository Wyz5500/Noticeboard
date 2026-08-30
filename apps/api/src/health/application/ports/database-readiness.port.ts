/** Defines the minimum database probe capability required by readiness checks. */

export interface DatabaseReadinessPort {
  /** Resolves true only when a trivial database query succeeds. */
  isReady(): Promise<boolean>;
}

export const DATABASE_READINESS = Symbol('DATABASE_READINESS');
