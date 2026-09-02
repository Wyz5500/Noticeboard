/** Exposes protected user and role management endpoints with OpenAPI descriptions. */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiErrorResponseDto } from '../../common/presentation/api-error-response.dto.js';
import { RequirePermission } from '../public/require-permission.decorator.js';
import {
  CreateAdminRole,
  CreateAdminUser,
  DeleteAdminRole,
  DeleteAdminUser,
  GetAdminOverview,
  RestoreAdminRole,
  RestoreAdminUser,
  UpdateAdminRole,
  UpdateAdminUser,
} from '../application/use-cases/admin-use-cases.js';
import {
  AdminOverviewResponseDto,
  AdminRoleResponseDto,
  AdminUserResponseDto,
  CreateAdminRoleDto,
  CreateAdminUserDto,
  UpdateAdminRoleDto,
  UpdateAdminUserDto,
  toAdminRoleResponse,
  toAdminUserResponse,
  toPermissionResponse,
} from './dto/admin.dto.js';

@ApiTags('admin')
@Controller({ path: 'admin', version: '1' })
@RequirePermission('system.manage')
@ApiSecurity('demo-user')
@ApiHeader({ name: 'X-Demo-User-Id', required: true })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
export class AdminController {
  /** Receives dedicated admin use cases and keeps HTTP mapping at the edge. */
  constructor(
    private readonly overview: GetAdminOverview,
    private readonly createUser: CreateAdminUser,
    private readonly updateUser: UpdateAdminUser,
    private readonly deleteUser: DeleteAdminUser,
    private readonly restoreUser: RestoreAdminUser,
    private readonly createRole: CreateAdminRole,
    private readonly updateRole: UpdateAdminRole,
    private readonly deleteRole: DeleteAdminRole,
    private readonly restoreRole: RestoreAdminRole,
  ) {}

  /** Lists users, roles, and the fixed permission catalog for the management view. */
  @Get('overview')
  @ApiOkResponse({ type: AdminOverviewResponseDto })
  async getOverview(): Promise<AdminOverviewResponseDto> {
    const result = await this.overview.execute();
    return {
      users: result.users.map(toAdminUserResponse),
      roles: result.roles.map(toAdminRoleResponse),
      permissions: result.permissions.map(toPermissionResponse),
    };
  }

  /** Creates one user with a server-generated identifier. */
  @Post('users')
  @ApiCreatedResponse({ type: AdminUserResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  createAdminUser(
    @Body() body: CreateAdminUserDto,
  ): Promise<AdminUserResponseDto> {
    return this.createUser.execute(body).then(toAdminUserResponse);
  }

  /** Updates one user's name or single assigned role. */
  @Patch('users/:id')
  @ApiOkResponse({ type: AdminUserResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  updateAdminUser(
    @Param('id') id: string,
    @Body() body: UpdateAdminUserDto,
  ): Promise<AdminUserResponseDto> {
    return this.updateUser.execute(id, body).then(toAdminUserResponse);
  }

  /** Soft-deletes one user while retaining task history. */
  @Delete('users/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async deleteAdminUser(@Param('id') id: string): Promise<void> {
    await this.deleteUser.execute(id);
  }

  /** Restores one logically deleted user. */
  @Post('users/:id/restore')
  @ApiOkResponse({ type: AdminUserResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  restoreAdminUser(@Param('id') id: string): Promise<AdminUserResponseDto> {
    return this.restoreUser.execute(id).then(toAdminUserResponse);
  }

  /** Creates a custom role, defaulting to an empty permission set. */
  @Post('roles')
  @ApiCreatedResponse({ type: AdminRoleResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  createAdminRole(
    @Body() body: CreateAdminRoleDto,
  ): Promise<AdminRoleResponseDto> {
    return this.createRole.execute(body).then(toAdminRoleResponse);
  }

  /** Updates one role's editable name and permissions. */
  @Patch('roles/:id')
  @ApiOkResponse({ type: AdminRoleResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  updateAdminRole(
    @Param('id') id: string,
    @Body() body: UpdateAdminRoleDto,
  ): Promise<AdminRoleResponseDto> {
    return this.updateRole.execute(id, body).then(toAdminRoleResponse);
  }

  /** Soft-deletes an unbound custom role. */
  @Delete('roles/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async deleteAdminRole(@Param('id') id: string): Promise<void> {
    await this.deleteRole.execute(id);
  }

  /** Restores one logically deleted custom role. */
  @Post('roles/:id/restore')
  @ApiOkResponse({ type: AdminRoleResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  restoreAdminRole(@Param('id') id: string): Promise<AdminRoleResponseDto> {
    return this.restoreRole.execute(id).then(toAdminRoleResponse);
  }
}
