/** Maps mutable task records to PostgreSQL while leaving the domain aggregate framework-free. */
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  VersionColumn,
} from 'typeorm';

import { AccountOrmEntity } from '../../../../identity/infrastructure/persistence/entities/account.orm-entity.js';
import type { TaskEventOrmEntity } from './task-event.orm-entity.js';

@Entity({ name: 'tasks' })
export class TaskOrmEntity {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  title!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: string;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ type: 'varchar', length: 120 })
  reward!: string;

  @Column({ name: 'due_date', type: 'date' })
  dueDate!: string;

  @Column({ name: 'publisher_id', type: 'varchar', length: 64 })
  publisherId!: string;

  @ManyToOne(() => AccountOrmEntity, { nullable: false })
  @JoinColumn({ name: 'publisher_id' })
  publisher!: AccountOrmEntity;

  @Column({ name: 'assignee_id', type: 'varchar', length: 64, nullable: true })
  assigneeId!: string | null;

  @ManyToOne(() => AccountOrmEntity, { nullable: true })
  @JoinColumn({ name: 'assignee_id' })
  assignee!: AccountOrmEntity | null;

  @Column({ type: 'varchar', length: 32 })
  status!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @VersionColumn({ type: 'integer' })
  version!: number;

  @OneToMany('TaskEventOrmEntity', 'task')
  events!: TaskEventOrmEntity[];
}
