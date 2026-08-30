/** Exposes demo-only identity discovery and deterministic task reset endpoints. */
import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiProperty,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiErrorResponseDto } from '../../common/presentation/api-error-response.dto.js';
import {
  ActorResponseDto,
  toActorResponse,
} from '../../tasks/presentation/dto/task-response.dto.js';
import { ResetDemoTasks } from '../../tasks/application/use-cases/reset-demo-tasks.js';
import { ListDemoActors } from '../application/use-cases/list-demo-actors.js';
import { DemoUserGuard } from './demo-user.guard.js';

export class ResetDemoResponseDto {
  @ApiProperty({ example: true })
  reset!: true;
}

@ApiTags('demo')
@Controller({ path: 'demo', version: '1' })
export class DemoController {
  /** Receives demo identity and reset application capabilities. */
  constructor(
    private readonly listDemoActors: ListDemoActors,
    private readonly resetDemoTasks: ResetDemoTasks,
  ) {}

  /** Lists selectable demo users without requiring an existing identity. */
  @Get('users')
  @ApiOkResponse({ type: [ActorResponseDto] })
  async users(): Promise<ActorResponseDto[]> {
    return (await this.listDemoActors.execute()).map(toActorResponse);
  }

  /** Restores deterministic server-side tasks after validating the demo actor. */
  @Post('reset')
  @HttpCode(200)
  @UseGuards(DemoUserGuard)
  @ApiSecurity('demo-user')
  @ApiHeader({ name: 'X-Demo-User-Id', required: true })
  @ApiOkResponse({ type: ResetDemoResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async reset(
    @Headers('x-demo-user-id') actorId: string,
  ): Promise<ResetDemoResponseDto> {
    await this.resetDemoTasks.execute(actorId);
    return { reset: true };
  }
}
