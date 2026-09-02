/** Validates the expired-task renewal date, strategy, and optimistic version. */
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Matches, Min } from 'class-validator';

import {
  TASK_RECOVERY_STRATEGIES,
  type TaskRecoveryStrategy,
} from '../../domain/task.types.js';

export class RenewExpiredTaskDto {
  @ApiProperty({ format: 'date', example: '2026-09-10' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate!: string;

  @ApiProperty({
    enum: TASK_RECOVERY_STRATEGIES,
    example: 'preserve_status',
  })
  @IsIn(TASK_RECOVERY_STRATEGIES)
  recoveryStrategy!: TaskRecoveryStrategy;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
