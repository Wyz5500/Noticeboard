/** Maps demo account records to PostgreSQL without exposing ORM entities across layers. */
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import type { RoleOrmEntity } from '../../../../authorization/infrastructure/persistence/entities/role.orm-entity.js';

@Entity({ name: 'accounts' })
export class AccountOrmEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ name: 'role_id', type: 'varchar', length: 64 })
  roleId!: string;

  @ManyToOne('RoleOrmEntity', { nullable: false })
  @JoinColumn({ name: 'role_id' })
  roleEntity!: RoleOrmEntity;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
