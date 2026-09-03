/** Validates task comment creation, editing, and deletion optimistic request bodies. */
import { ApiProperty } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsInt,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AddTaskCommentDto {
  @ApiProperty({
    example: '已完成第一阶段，明日提交结果',
    minLength: 1,
    maxLength: 1000,
  })
  @Transform(({ value }: TransformFnParams): unknown => {
    const input: unknown = value;
    return typeof input === 'string' ? input.trim() : input;
  })
  @IsString()
  @Matches(/^[^\0]*$/u)
  @MinLength(1)
  @MaxLength(1000)
  content!: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class EditTaskCommentDto {
  @ApiProperty({
    example: '第一阶段已经完成，等待复核',
    minLength: 1,
    maxLength: 1000,
  })
  @Transform(({ value }: TransformFnParams): unknown => {
    const input: unknown = value;
    return typeof input === 'string' ? input.trim() : input;
  })
  @IsString()
  @Matches(/^[^\0]*$/u)
  @MinLength(1)
  @MaxLength(1000)
  content!: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class DeleteTaskCommentDto {
  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
