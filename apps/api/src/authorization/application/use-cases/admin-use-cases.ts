/** Coordinates admin management requests through the authorization management port. */
import type {
  AdminOverviewModel,
  AdminRoleModel,
  AdminUserModel,
  AuthorizationManagementPort,
  CreateAdminRoleCommand,
  CreateAdminUserCommand,
  UpdateAdminRoleCommand,
  UpdateAdminUserCommand,
} from '../ports/authorization-management.port.js';

export class GetAdminOverview {
  /** Receives the admin projection capability. */
  constructor(private readonly management: AuthorizationManagementPort) {}

  /** Returns active and deleted accounts, roles, and the fixed permission catalog. */
  execute(): Promise<AdminOverviewModel> {
    return this.management.overview();
  }
}

export class CreateAdminUser {
  /** Receives the admin mutation capability. */
  constructor(private readonly management: AuthorizationManagementPort) {}

  /** Creates a server-identified user in the selected active role. */
  execute(command: CreateAdminUserCommand): Promise<AdminUserModel> {
    return this.management.createUser(command);
  }
}

export class UpdateAdminUser {
  /** Receives the admin mutation capability. */
  constructor(private readonly management: AuthorizationManagementPort) {}

  /** Updates one active or deleted user's editable fields. */
  execute(
    id: string,
    command: UpdateAdminUserCommand,
  ): Promise<AdminUserModel> {
    return this.management.updateUser(id, command);
  }
}

export class DeleteAdminUser {
  /** Receives the admin mutation capability. */
  constructor(private readonly management: AuthorizationManagementPort) {}

  /** Soft-deletes one user while preserving historical task references. */
  execute(id: string): Promise<void> {
    return this.management.softDeleteUser(id);
  }
}

export class RestoreAdminUser {
  /** Receives the admin mutation capability. */
  constructor(private readonly management: AuthorizationManagementPort) {}

  /** Restores one logically deleted user. */
  execute(id: string): Promise<AdminUserModel> {
    return this.management.restoreUser(id);
  }
}

export class CreateAdminRole {
  /** Receives the admin mutation capability. */
  constructor(private readonly management: AuthorizationManagementPort) {}

  /** Creates a custom role whose omitted permissions default to empty. */
  execute(command: CreateAdminRoleCommand): Promise<AdminRoleModel> {
    return this.management.createRole(command);
  }
}

export class UpdateAdminRole {
  /** Receives the admin mutation capability. */
  constructor(private readonly management: AuthorizationManagementPort) {}

  /** Updates a role's name and effective permission set. */
  execute(
    id: string,
    command: UpdateAdminRoleCommand,
  ): Promise<AdminRoleModel> {
    return this.management.updateRole(id, command);
  }
}

export class DeleteAdminRole {
  /** Receives the admin mutation capability. */
  constructor(private readonly management: AuthorizationManagementPort) {}

  /** Soft-deletes an unbound custom role. */
  execute(id: string): Promise<void> {
    return this.management.softDeleteRole(id);
  }
}

export class RestoreAdminRole {
  /** Receives the admin mutation capability. */
  constructor(private readonly management: AuthorizationManagementPort) {}

  /** Restores one logically deleted custom role. */
  execute(id: string): Promise<AdminRoleModel> {
    return this.management.restoreRole(id);
  }
}
