/** Adds immutable actor display snapshots to existing append-only task events. */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEventActorSnapshot1788062401000 implements MigrationInterface {
  name = 'AddEventActorSnapshot1788062401000';

  /** Backfills historical names and roles before making snapshot fields mandatory. */
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE task_events ADD COLUMN actor_name varchar(80), ADD COLUMN actor_role varchar(24)',
    );
    await queryRunner.query(`
      UPDATE task_events AS event
      SET actor_name = account.name, actor_role = account.role
      FROM accounts AS account
      WHERE account.id = event.actor_id
    `);
    await queryRunner.query(
      'ALTER TABLE task_events ALTER COLUMN actor_name SET NOT NULL, ALTER COLUMN actor_role SET NOT NULL',
    );
    await queryRunner.query(
      "ALTER TABLE task_events ADD CONSTRAINT task_events_actor_role_check CHECK (actor_role IN ('user'))",
    );
  }

  /** Removes actor snapshot columns while retaining the original account relationship. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE task_events DROP CONSTRAINT task_events_actor_role_check, DROP COLUMN actor_role, DROP COLUMN actor_name',
    );
  }
}
