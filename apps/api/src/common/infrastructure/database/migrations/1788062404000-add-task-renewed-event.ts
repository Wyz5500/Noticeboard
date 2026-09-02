/** Extends task event history with the expired-task renewal action. */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaskRenewedEvent1788062404000 implements MigrationInterface {
  name = 'AddTaskRenewedEvent1788062404000';

  /** Allows renewed events while leaving persisted task workflow statuses unchanged. */
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE task_events DROP CONSTRAINT task_events_action_check',
    );
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
