/** Maps identity values to the stable demo-user HTTP response contract. */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ALL_PERMISSION_CODES } from '../../../authorization/public/permission.js';
import type { Actor } from '../../public/actor.js';

export class ActorResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ example: 'user' })
  role!: string;

  @ApiProperty({ example: '演示用户' })
  roleLabel!: string;

  @ApiPropertyOptional({ enum: ALL_PERMISSION_CODES, isArray: true })
  permissions?: string[];
}

/** Adds the Chinese role label to one detached identity response. */
export function toActorResponse(actor: Actor): ActorResponseDto {
  return {
    ...actor,
    roleLabel:
      actor.roleLabel ??
      (actor.role === 'system_admin' ? '系统管理员' : '演示用户'),
  };
}
