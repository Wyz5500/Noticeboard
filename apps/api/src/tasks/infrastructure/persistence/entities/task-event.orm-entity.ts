/** Maps append-only task timeline events with a per-task sequence key. */
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { AccountOrmEntity } from '../../../../identity/infrastructure/persistence/entities/account.orm-entity.js';
import type { TaskOrmEntity } from './task.orm-entity.js';

@Entity({ name: 'task_events' })
export class TaskEventOrmEntity {
  @PrimaryColumn({ name: 'task_id', type: 'varchar', length: 100 })
  taskId!: string;

  @ManyToOne('TaskOrmEntity', 'events', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task!: TaskOrmEntity;

  @PrimaryColumn({ type: 'integer' })
  sequence!: number;

  @Column({ type: 'varchar', length: 32 })
  action!: string;

  @Column({ name: 'actor_id', type: 'varchar', length: 64 })
  actorId!: string;

  @ManyToOne(() => AccountOrmEntity, { nullable: false })
  @JoinColumn({ name: 'actor_id' })
  actor!: AccountOrmEntity;

  @Column({ name: 'actor_name', type: 'varchar', length: 80 })
  actorName!: string;

  @Column({ name: 'actor_role', type: 'varchar', length: 24 })
  actorRole!: string;

  @Column({ type: 'timestamptz' })
  at!: Date;

  @Column({ type: 'varchar', length: 200, default: '' })
  detail!: string;
}
