/** Composes global TypeORM metadata and migrations at the API Composition Root. */
import { DataSource, type DataSourceOptions } from 'typeorm';

import { authorizationPersistenceEntities } from './authorization/public/composition/persistence.js';
import { AddAdminUpdatedAt1788062403000 } from './common/infrastructure/database/migrations/1788062403000-add-admin-updated-at.js';
import { AddTaskRenewedEvent1788062404000 } from './common/infrastructure/database/migrations/1788062404000-add-task-renewed-event.js';
import { AddTimelineComments1788062405000 } from './common/infrastructure/database/migrations/1788062405000-add-timeline-comments.js';
import { AddCommentEdits1788062406000 } from './common/infrastructure/database/migrations/1788062406000-add-comment-edits.js';
import { AddAuthorizationSchema1788062402000 } from './common/infrastructure/database/migrations/1788062402000-add-authorization-schema.js';
import { CreateNoticeboardSchema1788062400000 } from './common/infrastructure/database/migrations/1788062400000-create-noticeboard-schema.js';
import { AddEventActorSnapshot1788062401000 } from './common/infrastructure/database/migrations/1788062401000-add-event-actor-snapshot.js';
import { identityPersistenceEntities } from './identity/public/composition/persistence.js';
import { taskPersistenceEntities } from './tasks/public/composition/persistence.js';

type DatabasePurpose = 'application' | 'migration';

/** Builds purpose-specific PostgreSQL options while permanently disabling schema synchronization. */
export function postgresDataSourceOptions(
  databaseUrl: string,
  purpose: DatabasePurpose = 'application',
): DataSourceOptions {
  if (!databaseUrl.trim()) throw new Error('DATABASE_URL is required');
  return {
    type: 'postgres',
    url: databaseUrl,
    connectTimeoutMS: 3_000,
    extra: {
      query_timeout: purpose === 'migration' ? 0 : 2_000,
      statement_timeout: 2_000,
    },
    synchronize: false,
    logging: false,
    entities: [
      ...identityPersistenceEntities(),
      ...authorizationPersistenceEntities(),
      ...taskPersistenceEntities(),
    ],
    migrations: [
      CreateNoticeboardSchema1788062400000,
      AddEventActorSnapshot1788062401000,
      AddAuthorizationSchema1788062402000,
      AddAdminUpdatedAt1788062403000,
      AddTaskRenewedEvent1788062404000,
      AddTimelineComments1788062405000,
      AddCommentEdits1788062406000,
    ],
    migrationsTableName: 'schema_migrations',
    migrationsTransactionMode: purpose === 'migration' ? 'each' : 'all',
  };
}

/** Creates an uninitialized PostgreSQL DataSource for runtime, CLI, or contract tests. */
export function createPostgresDataSource(
  databaseUrl: string,
  purpose: DatabasePurpose = 'application',
): DataSource {
  return new DataSource(postgresDataSourceOptions(databaseUrl, purpose));
}
