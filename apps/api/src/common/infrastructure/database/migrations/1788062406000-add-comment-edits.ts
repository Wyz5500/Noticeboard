/** Extends append-only task comment events with complete edit revisions. */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommentEdits1788062406000 implements MigrationInterface {
  name = 'AddCommentEdits1788062406000';

  /** Widens event checks without rewriting any existing timeline rows. */
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("SET LOCAL statement_timeout = '30s'");
    await queryRunner.query(
      'ALTER TABLE task_events DROP CONSTRAINT task_events_comment_payload_check, DROP CONSTRAINT task_events_action_check',
    );
    await queryRunner.query(
      "ALTER TABLE task_events ADD CONSTRAINT task_events_action_check CHECK (action IN ('created', 'accepted', 'completed', 'approved', 'reopened', 'renewed', 'closed', 'comment_created', 'comment_edited', 'comment_deleted'))",
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
          action IN ('created', 'accepted', 'completed', 'approved', 'reopened', 'renewed', 'closed')
          AND comment_id IS NULL
          AND content IS NULL
          AND target_comment_id IS NULL
        )
      )
    `);
  }

  /** Restores the previous contract only when no retained edit revisions exist. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("SET LOCAL statement_timeout = '30s'");
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
    await queryRunner.query(
      'ALTER TABLE task_events DROP CONSTRAINT task_events_comment_payload_check, DROP CONSTRAINT task_events_action_check',
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
  }
}
