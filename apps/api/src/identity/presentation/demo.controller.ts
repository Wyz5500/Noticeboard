/** Exposes demo-only identity discovery and deterministic task reset endpoints. */
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { ActorResponseDto, toActorResponse } from './dto/actor-response.dto.js';
import { ListDemoActors } from '../application/use-cases/list-demo-actors.js';

@ApiTags('demo')
@Controller({ path: 'demo', version: '1' })
export class DemoController {
  /** Receives the demo identity query owned by this Feature. */
  constructor(private readonly listDemoActors: ListDemoActors) {}

  /** Lists selectable demo users without requiring an existing identity. */
  @Get('users')
  @ApiOkResponse({ type: [ActorResponseDto] })
  async users(): Promise<ActorResponseDto[]> {
    return (await this.listDemoActors.execute()).map(toActorResponse);
  }
}
