/** Adds durable modification timestamps for administrator-managed accounts and roles. */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminUpdatedAt1788062403000 implements MigrationInterface {
  name = 'AddAdminUpdatedAt1788062403000';

  /** Adds non-null timestamps with database-generated initial values for existing records. */
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE accounts ADD COLUMN updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP',
    );
    await queryRunner.query(
      'ALTER TABLE roles ADD COLUMN updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP',
    );
  }

  /** Removes the timestamps when rolling back this schema addition. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE roles DROP COLUMN updated_at');
    await queryRunner.query('ALTER TABLE accounts DROP COLUMN updated_at');
  }
}
