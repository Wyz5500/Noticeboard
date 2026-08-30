/** Documents the stable public error envelope without exposing internal exception or ORM details. */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorBodyDto {
  @ApiProperty({ example: 'CONFLICT' })
  code!: string;

  @ApiProperty({ example: '任务已被其他操作更新' })
  message!: string;

  @ApiPropertyOptional()
  details?: unknown;
}

export class ApiErrorResponseDto {
  @ApiProperty({ type: ApiErrorBodyDto })
  error!: ApiErrorBodyDto;

  @ApiProperty({ example: '/api/v1/tasks/task-1/actions' })
  path!: string;

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;
}
