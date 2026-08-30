/** Serializes same-key UI commands so double clicks cannot duplicate server mutations. */

export class RequestGate {
  private readonly pending = new Set<string>();

  /** Runs the first same-key operation and returns null for duplicates until it settles. */
  async run<T>(key: string, operation: () => Promise<T>): Promise<T | null> {
    if (this.pending.has(key)) return null;
    this.pending.add(key);
    try {
      return await operation();
    } finally {
      this.pending.delete(key);
    }
  }
}
