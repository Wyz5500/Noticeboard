/** Adds roles, fixed role permissions, account lifecycle, and historical role names. */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthorizationSchema1788062402000 implements MigrationInterface {
  name = 'AddAuthorizationSchema1788062402000';

  /** Creates authorization records and migrates existing demo accounts safely. */
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE roles (
        id varchar(64) PRIMARY KEY,
        code varchar(64) NOT NULL UNIQUE,
        name varchar(80) NOT NULL,
        builtin boolean NOT NULL DEFAULT false,
        deleted_at timestamptz NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX roles_active_name_idx ON roles (name)
      WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE TABLE role_permissions (
        role_id varchar(64) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_code varchar(64) NOT NULL CHECK (permission_code IN (
          'system.manage', 'tasks.view', 'tasks.create', 'tasks.accept',
          'tasks.complete', 'tasks.review', 'tasks.close', 'demo.reset'
        )),
        PRIMARY KEY (role_id, permission_code)
      )
    `);
    await queryRunner.query(`
      INSERT INTO roles (id, code, name, builtin)
      VALUES
        ('role-system-admin', 'system_admin', '系统管理员', true),
        ('role-user', 'user', '用户', true)
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_code)
      SELECT 'role-system-admin', permission_code
      FROM unnest(ARRAY[
        'system.manage', 'tasks.view', 'tasks.create', 'tasks.accept',
        'tasks.complete', 'tasks.review', 'tasks.close', 'demo.reset'
      ]::varchar[]) AS permission_code
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_code)
      SELECT 'role-user', permission_code
      FROM unnest(ARRAY[
        'tasks.view', 'tasks.create', 'tasks.accept', 'tasks.complete',
        'tasks.review', 'tasks.close'
      ]::varchar[]) AS permission_code
    `);
    await queryRunner.query(
      'ALTER TABLE accounts ADD COLUMN role_id varchar(64), ADD COLUMN deleted_at timestamptz NULL',
    );
    await queryRunner.query(
      "UPDATE accounts SET role_id = 'role-user' WHERE role = 'user'",
    );
    await queryRunner.query(
      'ALTER TABLE accounts ALTER COLUMN role_id SET NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE accounts ADD CONSTRAINT accounts_role_fk FOREIGN KEY (role_id) REFERENCES roles(id)',
    );
    await queryRunner.query('ALTER TABLE accounts DROP COLUMN role');
    await queryRunner.query(
      'ALTER TABLE task_events DROP CONSTRAINT task_events_actor_role_check',
    );
    await queryRunner.query(
      'ALTER TABLE task_events ALTER COLUMN actor_role TYPE varchar(64), ADD COLUMN actor_role_name varchar(80)',
    );
    await queryRunner.query(`
      UPDATE task_events AS event
      SET actor_role_name = role.name
      FROM accounts AS account
      JOIN roles AS role ON role.id = account.role_id
      WHERE event.actor_id = account.id
    `);
    await queryRunner.query(
      'ALTER TABLE task_events ALTER COLUMN actor_role_name SET NOT NULL',
    );
    await queryRunner.query(
      "ALTER TABLE task_events ADD CONSTRAINT task_events_actor_role_check CHECK (actor_role IN ('system_admin', 'user') OR actor_role LIKE 'role-%')",
    );
  }

  /** Removes authorization additions and restores the first-release account shape. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE task_events DROP CONSTRAINT task_events_actor_role_check, DROP COLUMN actor_role_name',
    );
    await queryRunner.query(
      "UPDATE task_events SET actor_role = 'user' WHERE actor_role <> 'user'",
    );
    await queryRunner.query(
      'ALTER TABLE task_events ALTER COLUMN actor_role TYPE varchar(24)',
    );
    await queryRunner.query(
      "ALTER TABLE task_events ADD CONSTRAINT task_events_actor_role_check CHECK (actor_role IN ('user'))",
    );
    await queryRunner.query(
      "ALTER TABLE accounts ADD COLUMN role varchar(24) NOT NULL DEFAULT 'user'",
    );
    await queryRunner.query(
      "ALTER TABLE accounts ADD CONSTRAINT accounts_role_check CHECK (role IN ('user'))",
    );
    await queryRunner.query(
      'ALTER TABLE accounts DROP CONSTRAINT accounts_role_fk, DROP COLUMN role_id, DROP COLUMN deleted_at',
    );
    await queryRunner.query('DROP TABLE role_permissions');
    await queryRunner.query('DROP INDEX roles_active_name_idx');
    await queryRunner.query('DROP TABLE roles');
  }
}
