/** Creates the PostgreSQL account, task, and ordered event schema for the first server release. */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNoticeboardSchema1788062400000 implements MigrationInterface {
  name = 'CreateNoticeboardSchema1788062400000';

  /** Creates constraints, foreign keys, versioning, and deterministic list ordering index. */
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE accounts (
        id varchar(64) PRIMARY KEY,
        name varchar(80) NOT NULL,
        role varchar(24) NOT NULL CHECK (role IN ('user'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE tasks (
        id varchar(100) PRIMARY KEY,
        title varchar(80) NOT NULL,
        type varchar(32) NOT NULL CHECK (type IN ('exploration', 'collection', 'escort', 'bounty', 'building')),
        description varchar(500) NOT NULL,
        reward varchar(120) NOT NULL,
        due_date date NOT NULL,
        publisher_id varchar(64) NOT NULL REFERENCES accounts(id),
        assignee_id varchar(64) NULL REFERENCES accounts(id),
        status varchar(32) NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed', 'reopened', 'closed')),
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        version integer NOT NULL DEFAULT 1 CHECK (version > 0)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX tasks_created_order_idx ON tasks (created_at DESC, id ASC)',
    );
    await queryRunner.query(`
      CREATE TABLE task_events (
        task_id varchar(100) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        sequence integer NOT NULL CHECK (sequence > 0),
        action varchar(32) NOT NULL CHECK (action IN ('created', 'accepted', 'completed', 'approved', 'reopened', 'closed')),
        actor_id varchar(64) NOT NULL REFERENCES accounts(id),
        at timestamptz NOT NULL,
        detail varchar(200) NOT NULL DEFAULT '',
        PRIMARY KEY (task_id, sequence)
      )
    `);
  }

  /** Removes the first-release schema in reverse dependency order. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE task_events');
    await queryRunner.query('DROP INDEX tasks_created_order_idx');
    await queryRunner.query('DROP TABLE tasks');
    await queryRunner.query('DROP TABLE accounts');
  }
}
