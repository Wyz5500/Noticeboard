/** Adds stable usernames and append-only task comment event payloads. */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTimelineComments1788062405000 implements MigrationInterface {
  name = 'AddTimelineComments1788062405000';

  /** Backfills stable username snapshots before enforcing comment-event integrity. */
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("SET LOCAL statement_timeout = '30s'");
    const schemaStates = (await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'accounts'
          AND column_name = 'username'
      ) AS comment_schema_exists
    `)) as Array<{ comment_schema_exists: boolean }>;
    if (schemaStates[0]?.comment_schema_exists) {
      await queryRunner.query(
        'ALTER TABLE task_events DROP CONSTRAINT IF EXISTS task_events_action_check',
      );
      await queryRunner.query(
        "ALTER TABLE task_events ADD CONSTRAINT task_events_action_check CHECK (action IN ('created', 'accepted', 'completed', 'approved', 'reopened', 'renewed', 'closed', 'comment_created', 'comment_edited', 'comment_deleted'))",
      );
      return;
    }
    await queryRunner.query(
      'ALTER TABLE accounts ADD COLUMN username varchar(64)',
    );
    await queryRunner.query(`
      CREATE FUNCTION set_account_username_from_id()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.username IS NULL THEN
          NEW.username := NEW.id;
        END IF;
        RETURN NEW;
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER accounts_username_default_trigger
      BEFORE INSERT ON accounts
      FOR EACH ROW EXECUTE FUNCTION set_account_username_from_id()
    `);
    await queryRunner.query('UPDATE accounts SET username = id');
    await queryRunner.query(
      'ALTER TABLE accounts ALTER COLUMN username SET NOT NULL, ADD CONSTRAINT accounts_username_key UNIQUE (username)',
    );
    await queryRunner.query(
      'ALTER TABLE task_events ADD COLUMN actor_username varchar(64), ADD COLUMN comment_id varchar(100), ADD COLUMN content varchar(1000), ADD COLUMN target_comment_id varchar(100)',
    );
    await queryRunner.query(`
      CREATE FUNCTION set_task_event_actor_username_from_id()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.actor_username IS NULL THEN
          NEW.actor_username := NEW.actor_id;
        END IF;
        RETURN NEW;
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER task_events_actor_username_default_trigger
      BEFORE INSERT ON task_events
      FOR EACH ROW EXECUTE FUNCTION set_task_event_actor_username_from_id()
    `);
    await queryRunner.query('UPDATE task_events SET actor_username = actor_id');
    await queryRunner.query(
      'ALTER TABLE task_events ALTER COLUMN actor_username SET NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE task_events DROP CONSTRAINT task_events_action_check',
    );
    await queryRunner.query(
      "ALTER TABLE task_events ADD CONSTRAINT task_events_action_check CHECK (action IN ('created', 'accepted', 'completed', 'approved', 'reopened', 'renewed', 'closed', 'comment_created', 'comment_deleted'))",
    );
    await queryRunner.query(`
      ALTER TABLE task_events
      ADD CONSTRAINT task_events_comment_payload_check CHECK (
        (
          action = 'comment_created'
          AND comment_id IS NOT NULL
          AND btrim(comment_id) <> ''
          AND content IS NOT NULL
          AND btrim(content) <> ''
          AND char_length(content) <= 1000
          AND target_comment_id IS NULL
        )
        OR (
          action = 'comment_deleted'
          AND comment_id IS NULL
          AND content IS NULL
          AND target_comment_id IS NOT NULL
          AND btrim(target_comment_id) <> ''
        )
        OR (
          action IN ('created', 'accepted', 'completed', 'approved', 'reopened', 'renewed', 'closed')
          AND comment_id IS NULL
          AND content IS NULL
          AND target_comment_id IS NULL
        )
      )
    `);
    await queryRunner.query(
      "CREATE UNIQUE INDEX task_events_comment_id_idx ON task_events (task_id, comment_id) WHERE action = 'comment_created'",
    );
    await queryRunner.query(
      "CREATE UNIQUE INDEX task_events_deleted_comment_idx ON task_events (task_id, target_comment_id) WHERE action = 'comment_deleted'",
    );
  }

  /** Removes comment payloads and usernames while restoring the lifecycle-only event contract. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("SET LOCAL statement_timeout = '30s'");
    await queryRunner.query(
      "DELETE FROM task_events WHERE action IN ('comment_created', 'comment_deleted')",
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS task_events_deleted_comment_idx',
    );
    await queryRunner.query('DROP INDEX IF EXISTS task_events_comment_id_idx');
    await queryRunner.query(
      'ALTER TABLE task_events DROP CONSTRAINT task_events_comment_payload_check, DROP CONSTRAINT task_events_action_check',
    );
    await queryRunner.query(
      "ALTER TABLE task_events ADD CONSTRAINT task_events_action_check CHECK (action IN ('created', 'accepted', 'completed', 'approved', 'reopened', 'renewed', 'closed'))",
    );
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS task_events_actor_username_default_trigger ON task_events',
    );
    await queryRunner.query(
      'DROP FUNCTION IF EXISTS set_task_event_actor_username_from_id()',
    );
    await queryRunner.query(
      'ALTER TABLE task_events DROP COLUMN target_comment_id, DROP COLUMN content, DROP COLUMN comment_id, DROP COLUMN actor_username',
    );
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS accounts_username_default_trigger ON accounts',
    );
    await queryRunner.query(
      'DROP FUNCTION IF EXISTS set_account_username_from_id()',
    );
    await queryRunner.query('ALTER TABLE accounts DROP COLUMN username');
  }
}
