/** Maps demo account records to PostgreSQL without exposing ORM entities across layers. */
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  AUTHORIZATION_ROLE_ENTITY,
  type AuthorizationRolePersistenceRecord,
} from '../../../../authorization/public/persistence.js';
import type { IdentityAccountPersistenceRecord } from '../../../public/persistence.js';

@Entity({ name: 'accounts' })
export class AccountOrmEntity implements IdentityAccountPersistenceRecord {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ name: 'role_id', type: 'varchar', length: 64 })
  roleId!: string;

  @ManyToOne(AUTHORIZATION_ROLE_ENTITY, { nullable: false })
  @JoinColumn({ name: 'role_id' })
  roleEntity!: AuthorizationRolePersistenceRecord;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
