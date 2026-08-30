/** Exposes Kubernetes-compatible process liveness and PostgreSQL readiness checks. */
import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorResponseDto } from '../../common/presentation/api-error-response.dto.js';
import { HealthService } from '../application/health.service.js';

export class LiveHealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';
}

export class ReadyHealthResponseDto {
  @ApiProperty({ example: 'ready' })
  status!: 'ready';

  @ApiProperty({ example: 'up' })
  database!: 'up';
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  /** Receives the transport-independent health application service. */
  constructor(private readonly health: HealthService) {}

  /** Returns process liveness without testing the database. */
  @Get('live')
  @ApiOkResponse({ type: LiveHealthResponseDto })
  live(): LiveHealthResponseDto {
    return this.health.live();
  }

  /** Returns readiness only after the database probe succeeds. */
  @Get('ready')
  @ApiOkResponse({ type: ReadyHealthResponseDto })
  @ApiServiceUnavailableResponse({ type: ApiErrorResponseDto })
  ready(): Promise<ReadyHealthResponseDto> {
    return this.health.ready();
  }
}
