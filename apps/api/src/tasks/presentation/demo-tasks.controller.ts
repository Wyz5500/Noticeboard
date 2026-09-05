/** Exposes the task-owned demo reset endpoint without crossing presentation boundaries. */
import { Controller, Headers, HttpCode, Post } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiErrorResponseDto } from '../../common/presentation/api-error-response.dto.js';
import { RequireDemoIdentity } from '../../identity/public/require-demo-identity.decorator.js';
import { ResetDemoTasks } from '../application/use-cases/reset-demo-tasks.js';

export class ResetDemoResponseDto {
  @ApiProperty({ example: true })
  reset!: true;
}

@ApiTags('demo')
@Controller({ path: 'demo', version: '1' })
export class DemoTasksController {
  /** Receives only the task reset application capability. */
  constructor(private readonly resetDemoTasks: ResetDemoTasks) {}

  /** Restores deterministic server-side tasks after validating the demo actor. */
  @Post('reset')
  @HttpCode(200)
  @ApiOperation({ operationId: 'resetDemoTasks' })
  @RequireDemoIdentity()
  @ApiSecurity('demo-user')
  @ApiOkResponse({ type: ResetDemoResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  async reset(
    @Headers('x-demo-user-id') actorId: string,
  ): Promise<ResetDemoResponseDto> {
    await this.resetDemoTasks.execute(actorId);
    return { reset: true };
  }
}
