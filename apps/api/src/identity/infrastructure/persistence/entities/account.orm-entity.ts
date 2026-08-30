/** Maps demo account records to PostgreSQL without exposing ORM entities across layers. */
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'accounts' })
export class AccountOrmEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'varchar', length: 24 })
  role!: string;
}
