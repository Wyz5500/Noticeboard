/** Runs explicit migration, rollback, and deterministic demo seed operations for deployment jobs. */
import { loadDatabaseUrl } from './common/infrastructure/config/runtime-config.js';
import { createPostgresDataSource } from './database.js';
import { seedDemoData } from './seed-demo-data.js';

/** Executes exactly one database command and always closes the connection pool. */
async function run(): Promise<void> {
  const command = process.argv[2];
  if (
    command !== 'migration:run' &&
    command !== 'migration:revert' &&
    command !== 'seed'
  )
    throw new Error('Expected migration:run, migration:revert, or seed');
  const dataSource = createPostgresDataSource(
    loadDatabaseUrl(),
    command === 'seed' ? 'application' : 'migration',
  );
  await dataSource.initialize();
  try {
    if (command === 'migration:run') {
      await dataSource.runMigrations();
    } else if (command === 'migration:revert') {
      await dataSource.undoLastMigration({ transaction: 'none' });
    } else if (command === 'seed') {
      await dataSource.transaction(seedDemoData);
    }
    console.log(JSON.stringify({ level: 'info', command, status: 'complete' }));
  } finally {
    await dataSource.destroy();
  }
}

void run().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      level: 'error',
      message:
        error instanceof Error ? error.message : 'Unknown database CLI error',
    }),
  );
  process.exitCode = 1;
});
