/** Extends append-only task comment events with complete edit revisions. */
import type { MigrationInterface, QueryRunner } from 'typeorm';

type MigrationPhase = () => Promise<void>;

/** Runs one independently committed migration phase with bounded lock acquisition. */
async function runMigrationPhase(
  queryRunner: QueryRunner,
  statementTimeout: '0' | '30s',
  phase: MigrationPhase,
): Promise<void> {
  await queryRunner.startTransaction();
  try {
    await queryRunner.query("SET LOCAL lock_timeout = '30s'");
    await queryRunner.query(
      `SET LOCAL statement_timeout = '${statementTimeout}'`,
    );
    await phase();
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  }
}

export class AddCommentEdits1788062406000 implements MigrationInterface {
  name = 'AddCommentEdits1788062406000';
  transaction = false;

  /** Widens event checks while releasing exclusive locks before full validation. */
  async up(queryRunner: QueryRunner): Promise<void> {
    await runMigrationPhase(queryRunner, '30s', async () => {
      await queryRunner.query(`
        ALTER TABLE task_events
        DROP CONSTRAINT IF EXISTS task_events_comment_payload_check_next,
        DROP CONSTRAINT IF EXISTS task_events_action_check_next,
        ADD CONSTRAINT task_events_action_check_next CHECK (
          action IN (
            'created', 'accepted', 'completed', 'approved', 'reopened',
            'renewed', 'closed', 'comment_created', 'comment_edited',
            'comment_deleted'
          )
        ) NOT VALID,
        ADD CONSTRAINT task_events_comment_payload_check_next CHECK (
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
            action = 'comment_edited'
            AND comment_id IS NULL
            AND content IS NOT NULL
            AND btrim(content) <> ''
            AND char_length(content) <= 1000
            AND target_comment_id IS NOT NULL
            AND btrim(target_comment_id) <> ''
          )
          OR (
            action = 'comment_deleted'
            AND comment_id IS NULL
            AND content IS NULL
            AND target_comment_id IS NOT NULL
            AND btrim(target_comment_id) <> ''
          )
          OR (
            action IN (
              'created', 'accepted', 'completed', 'approved', 'reopened',
              'renewed', 'closed'
            )
            AND comment_id IS NULL
            AND content IS NULL
            AND target_comment_id IS NULL
          )
        ) NOT VALID
      `);
    });
    await runMigrationPhase(queryRunner, '0', async () => {
      await queryRunner.query(`
        ALTER TABLE task_events
        VALIDATE CONSTRAINT task_events_action_check_next,
        VALIDATE CONSTRAINT task_events_comment_payload_check_next
      `);
    });
    await runMigrationPhase(queryRunner, '30s', async () => {
      await queryRunner.query(`
        ALTER TABLE task_events
        DROP CONSTRAINT task_events_comment_payload_check,
        DROP CONSTRAINT task_events_action_check
      `);
      await queryRunner.query(`
        ALTER TABLE task_events
        RENAME CONSTRAINT task_events_action_check_next
        TO task_events_action_check
      `);
      await queryRunner.query(`
        ALTER TABLE task_events
        RENAME CONSTRAINT task_events_comment_payload_check_next
        TO task_events_comment_payload_check
      `);
    });
  }

  /** Restores prior checks only when no retained edit revisions exist. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await runMigrationPhase(queryRunner, '0', async () => {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM task_events WHERE action = 'comment_edited'
          ) THEN
            RAISE EXCEPTION '无法回退：task_events 中仍存在 comment_edited 历史';
          END IF;
        END
        $$
      `);
    });
    await runMigrationPhase(queryRunner, '30s', async () => {
      await queryRunner.query(`
        ALTER TABLE task_events
        DROP CONSTRAINT IF EXISTS task_events_comment_payload_check_next,
        DROP CONSTRAINT IF EXISTS task_events_action_check_next,
        ADD CONSTRAINT task_events_action_check_next CHECK (
          action IN (
            'created', 'accepted', 'completed', 'approved', 'reopened',
            'renewed', 'closed', 'comment_created', 'comment_deleted'
          )
        ) NOT VALID,
        ADD CONSTRAINT task_events_comment_payload_check_next CHECK (
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
            action IN (
              'created', 'accepted', 'completed', 'approved', 'reopened',
              'renewed', 'closed'
            )
            AND comment_id IS NULL
            AND content IS NULL
            AND target_comment_id IS NULL
          )
        ) NOT VALID
      `);
    });
    await runMigrationPhase(queryRunner, '0', async () => {
      await queryRunner.query(`
        ALTER TABLE task_events
        VALIDATE CONSTRAINT task_events_action_check_next,
        VALIDATE CONSTRAINT task_events_comment_payload_check_next
      `);
    });
    await runMigrationPhase(queryRunner, '30s', async () => {
      await queryRunner.query(`
        ALTER TABLE task_events
        DROP CONSTRAINT task_events_comment_payload_check,
        DROP CONSTRAINT task_events_action_check
      `);
      await queryRunner.query(`
        ALTER TABLE task_events
        RENAME CONSTRAINT task_events_action_check_next
        TO task_events_action_check
      `);
      await queryRunner.query(`
        ALTER TABLE task_events
        RENAME CONSTRAINT task_events_comment_payload_check_next
        TO task_events_comment_payload_check
      `);
    });
  }
}
