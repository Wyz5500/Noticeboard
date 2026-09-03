/** Extends task event history with the expired-task renewal action. */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaskRenewedEvent1788062404000 implements MigrationInterface {
  name = 'AddTaskRenewedEvent1788062404000';

  /** Allows renewed events while leaving persisted task workflow statuses unchanged. */
  async up(queryRunner: QueryRunner): Promise<void> {
    const schemaStates = (await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'task_events'
          AND column_name = 'comment_id'
      ) AS comment_schema_exists
    `)) as Array<{ comment_schema_exists: boolean }>;
    const commentSchemaExists = schemaStates[0]?.comment_schema_exists === true;
    await queryRunner.query(
      'ALTER TABLE task_events DROP CONSTRAINT task_events_action_check',
    );
    if (commentSchemaExists) {
      await queryRunner.query(
        "ALTER TABLE task_events ADD CONSTRAINT task_events_action_check CHECK (action IN ('created', 'accepted', 'completed', 'approved', 'reopened', 'renewed', 'closed', 'comment_created', 'comment_deleted'))",
      );
      await queryRunner.query(
        'ALTER TABLE task_events DROP CONSTRAINT task_events_comment_payload_check',
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
      return;
    }
    await queryRunner.query(
      "ALTER TABLE task_events ADD CONSTRAINT task_events_action_check CHECK (action IN ('created', 'accepted', 'completed', 'approved', 'reopened', 'renewed', 'closed'))",
    );
  }

  /** Restores the prior action constraint when no renewed history remains. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE task_events DROP CONSTRAINT task_events_action_check',
    );
    await queryRunner.query(
      "ALTER TABLE task_events ADD CONSTRAINT task_events_action_check CHECK (action IN ('created', 'accepted', 'completed', 'approved', 'reopened', 'closed'))",
    );
  }
}
