/** Composes TypeORM metadata and migrations with synchronization permanently disabled. */
import { DataSource, type DataSourceOptions } from 'typeorm';

import { CreateGuildSchema1788062400000 } from '../../../common/infrastructure/database/migrations/1788062400000-create-guild-schema.js';
import { AddEventActorSnapshot1788062401000 } from '../../../common/infrastructure/database/migrations/1788062401000-add-event-actor-snapshot.js';
import { AccountOrmEntity } from '../../../identity/infrastructure/persistence/entities/account.orm-entity.js';
import { TaskEventOrmEntity } from './entities/task-event.orm-entity.js';
import { TaskOrmEntity } from './entities/task.orm-entity.js';

/** Builds shared PostgreSQL options while permanently disabling schema synchronization. */
export function postgresDataSourceOptions(
  databaseUrl: string,
): DataSourceOptions {
  if (!databaseUrl.trim()) throw new Error('DATABASE_URL is required');
  return {
    type: 'postgres',
    url: databaseUrl,
    connectTimeoutMS: 3_000,
    extra: {
      query_timeout: 2_000,
      statement_timeout: 2_000,
    },
    synchronize: false,
    logging: false,
    entities: [AccountOrmEntity, TaskOrmEntity, TaskEventOrmEntity],
    migrations: [
      CreateGuildSchema1788062400000,
      AddEventActorSnapshot1788062401000,
    ],
    migrationsTableName: 'schema_migrations',
  };
}

/** Creates an uninitialized PostgreSQL DataSource for runtime, CLI, or contract tests. */
export function createPostgresDataSource(databaseUrl: string): DataSource {
  return new DataSource(postgresDataSourceOptions(databaseUrl));
}
