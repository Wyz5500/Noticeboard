/** Validates the stable task-action request and optimistic version contract. */
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Min } from 'class-validator';

import { TASK_ACTIONS, type TaskAction } from '../../domain/task.types.js';

export class ActTaskDto {
  @ApiProperty({ enum: TASK_ACTIONS, example: 'accept' })
  @IsIn(TASK_ACTIONS)
  action!: TaskAction;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
