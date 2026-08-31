/** Maps fixed role permission assignments to PostgreSQL without a generic repository abstraction. */
import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { RoleOrmEntity } from './role.orm-entity.js';

@Entity({ name: 'role_permissions' })
export class RolePermissionOrmEntity {
  @PrimaryColumn({ name: 'role_id', type: 'varchar', length: 64 })
  roleId!: string;

  @ManyToOne(() => RoleOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role!: RoleOrmEntity;

  @PrimaryColumn({ name: 'permission_code', type: 'varchar', length: 64 })
  permissionCode!: string;
}
