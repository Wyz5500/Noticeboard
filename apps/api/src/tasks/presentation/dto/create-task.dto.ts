/** Validates the stable task-creation request independently from domain and ORM models. */
import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { TASK_TYPES, type TaskType } from '../../domain/task.types.js';

export class CreateTaskDto {
  @ApiProperty({ example: '寻找遗失的地图碎片', maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  title!: string;

  @ApiProperty({ enum: TASK_TYPES, example: 'exploration' })
  @IsIn(TASK_TYPES)
  type!: TaskType;

  @ApiProperty({ example: '绘制安全路线并带回现场印记', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description!: string;

  @ApiProperty({ example: '30 金币 · 稀有材料包', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  reward!: string;

  @ApiProperty({ example: '2026-09-10', format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate!: string;
}
