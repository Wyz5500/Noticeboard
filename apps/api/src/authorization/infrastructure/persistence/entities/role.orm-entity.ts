/** Maps role records to PostgreSQL while keeping role persistence out of application code. */
import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';

import type { RolePermissionOrmEntity } from './role-permission.orm-entity.js';

@Entity({ name: 'roles' })
export class RoleOrmEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'boolean' })
  builtin!: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToMany('RolePermissionOrmEntity', 'role')
  rolePermissions!: RolePermissionOrmEntity[];
}
