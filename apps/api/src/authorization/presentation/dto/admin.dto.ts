/** Defines validated admin HTTP DTOs and detached response mappings. */
import { IsArray, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  ALL_PERMISSION_CODES,
  type PermissionCode,
} from '../../public/permission.js';
import type {
  AdminRoleModel,
  AdminUserModel,
  PermissionModel,
} from '../../application/ports/authorization-management.port.js';

export class CreateAdminUserDto {
  @ApiProperty({ example: '新冒险家' })
  @IsString()
  @Length(1, 80)
  name!: string;

  @ApiProperty({ example: 'role-user' })
  @IsString()
  @Length(1, 64)
  roleId!: string;
}

export class UpdateAdminUserDto {
  @ApiPropertyOptional({ example: '新名字' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @ApiPropertyOptional({ example: 'role-user' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  roleId?: string;
}

export class CreateAdminRoleDto {
  @ApiProperty({ example: '任务审核员' })
  @IsString()
  @Length(1, 80)
  name!: string;

  @ApiPropertyOptional({ enum: ALL_PERMISSION_CODES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(ALL_PERMISSION_CODES, { each: true })
  permissions?: PermissionCode[];
}

export class UpdateAdminRoleDto {
  @ApiProperty({ example: '任务审核员' })
  @IsString()
  @Length(1, 80)
  name!: string;

  @ApiProperty({ enum: ALL_PERMISSION_CODES, isArray: true })
  @IsArray()
  @IsIn(ALL_PERMISSION_CODES, { each: true })
  permissions!: PermissionCode[];
}

export class AdminUserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty() name!: string;
  @ApiProperty() roleId!: string;
  @ApiProperty() roleCode!: string;
  @ApiProperty() roleName!: string;
  @ApiProperty() active!: boolean;
  @ApiProperty({ nullable: true }) deletedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class AdminRoleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() builtin!: boolean;
  @ApiProperty({ enum: ALL_PERMISSION_CODES, isArray: true })
  permissions!: PermissionCode[];
  @ApiProperty() active!: boolean;
  @ApiProperty({ nullable: true }) deletedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class PermissionResponseDto {
  @ApiProperty({ enum: ALL_PERMISSION_CODES }) code!: PermissionCode;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
}

export class AdminOverviewResponseDto {
  @ApiProperty({ type: [AdminUserResponseDto] }) users!: AdminUserResponseDto[];
  @ApiProperty({ type: [AdminRoleResponseDto] }) roles!: AdminRoleResponseDto[];
  @ApiProperty({ type: [PermissionResponseDto] })
  permissions!: PermissionResponseDto[];
}

/** Maps application user projections to transport DTOs without returning ORM values. */
export function toAdminUserResponse(
  user: AdminUserModel,
): AdminUserResponseDto {
  return { ...user };
}

/** Maps application role projections to transport DTOs without returning ORM values. */
export function toAdminRoleResponse(
  role: AdminRoleModel,
): AdminRoleResponseDto {
  return { ...role, permissions: [...role.permissions] };
}

/** Maps the fixed permission catalog to detached transport values. */
export function toPermissionResponse(
  permission: PermissionModel,
): PermissionResponseDto {
  return { ...permission };
}
