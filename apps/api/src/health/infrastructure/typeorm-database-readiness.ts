/** Implements database readiness with a bounded trivial query against TypeORM's pool. */
import type { DatabaseReadinessPort } from '../application/ports/database-readiness.port.js';

interface ReadinessDataSource {
  readonly isInitialized: boolean;
  query(sql: string): Promise<unknown>;
}

export class TypeOrmDatabaseReadiness implements DatabaseReadinessPort {
  /** Binds the probe to the application DataSource lifecycle. */
  constructor(
    private readonly dataSource: ReadinessDataSource,
    private readonly timeoutMs = 2_000,
  ) {}

  /** Returns false for uninitialized pools or any failed SELECT probe. */
  async isReady(): Promise<boolean> {
    if (!this.dataSource.isInitialized) return false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.dataSource.query('SELECT 1').then(
          () => true,
          () => false,
        ),
        new Promise<false>((resolve) => {
          timeout = setTimeout(() => resolve(false), this.timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
