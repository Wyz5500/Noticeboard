/** Validates management inputs and submits single HTTP writes through the SDK public boundary. */
import { requireText, type Command } from './arguments.js';
import { requestProfile, type Config } from './config.js';
import { CliError, ManagementWriteFailure } from './errors.js';
import { safeText } from './output.js';
import type { CliContext } from './run.js';
import {
  createNoticeboardClient,
  type Permission,
  type UpdateAdminUserInput,
} from './sdk/index.js';

const PERMISSIONS: readonly Permission[] = [
  'system.manage',
  'tasks.view',
  'tasks.create',
  'tasks.accept',
  'tasks.complete',
  'tasks.review',
  'tasks.close',
  'demo.reset',
];

/** Keeps management mutation dispatch separate from overview reads and task versions. */
export function isManagementWriteCommand(name: string): boolean {
  return [
    'user create',
    'user update',
    'user delete',
    'user restore',
    'role create',
    'role update',
    'role delete',
    'role restore',
  ].includes(name);
}

/** Requires meaningful text while leaving server length and business rules authoritative. */
function nameInput(value: string | undefined, label: string): string {
  requireText(value, label, 'usage');
  return value;
}

/** Parses an explicit permission replacement without silently dropping invalid or repeated entries. */
function permissionInput(command: Command): Permission[] | undefined {
  const value = command.options.permissions;
  if (command.options['clear-permissions']) {
    if (value !== undefined)
      throw new CliError(
        'usage',
        '--permissions 与 --clear-permissions 不能同时提供',
      );
    return [];
  }
  if (value === undefined) return undefined;
  const permissions = value.split(',').map((code) => code.trim());
  if (
    permissions.some((code) => !PERMISSIONS.includes(code as Permission)) ||
    new Set(permissions).size !== permissions.length
  )
    throw new CliError(
      'usage',
      '--permissions 必须为不重复的有效权限码，以逗号分隔；清空请使用 --clear-permissions',
    );
  return permissions as Permission[];
}

/** Validates and confirms before starting the shared cancellation window; never pre-reads or retries. */
export async function managementWriteCommand(
  command: Command,
  config: Config,
  context: CliContext,
): Promise<{ data: unknown }> {
  const resource = command.name.startsWith('user ') ? 'user' : 'role';
  const action = command.name.split(' ')[1]!;
  const id = command.operands[0];
  const profile = requestProfile(config, command, context.env);
  const userInput: UpdateAdminUserInput = {};
  let roleName: string | undefined;
  let permissions: Permission[] | undefined;
  if (action === 'create' || action === 'update') {
    if (resource === 'user') {
      if (action === 'create' || command.options.name !== undefined)
        userInput.name = nameInput(command.options.name, '--name');
      if (action === 'create' || command.options['role-id'] !== undefined)
        userInput.roleId = nameInput(command.options['role-id'], '--role-id');
      if (!Object.keys(userInput).length)
        throw new CliError('usage', 'user update 至少提供 --name 或 --role-id');
    } else {
      roleName = nameInput(command.options.name, '--name');
      permissions = permissionInput(command);
      if (action === 'update' && permissions === undefined)
        throw new CliError(
          'usage',
          'role update 必须提供 --permissions 或 --clear-permissions',
        );
    }
  }
  if (action === 'delete' && !command.options.yes) {
    if (!context.isTTY || command.options.json)
      throw new CliError('usage', '非交互或 JSON 删除必须提供 --yes');
    if (
      !(await context.confirm(
        `确认删除${resource === 'user' ? '用户' : '角色'} ${safeText(id)}？[y/N] `,
      ))
    )
      throw new CliError('usage', '已取消删除');
  }
  const client = createNoticeboardClient({
    baseUrl: profile.baseUrl,
    fetch: context.fetch,
    getHeaders: () => ({ 'X-Demo-User-Id': profile.demoUserId }),
  });
  const options = { signal: AbortSignal.timeout(30_000) };
  try {
    if (action === 'delete') {
      await (
        resource === 'user' ? client.admin.users : client.admin.roles
      ).delete(id!, options);
      return { data: { ok: true, id: id! } };
    }
    if (action === 'restore')
      return {
        data: await (
          resource === 'user' ? client.admin.users : client.admin.roles
        ).restore(id!, options),
      };
    if (resource === 'user')
      return {
        data:
          action === 'create'
            ? await client.admin.users.create(
                { name: userInput.name!, roleId: userInput.roleId! },
                options,
              )
            : await client.admin.users.update(id!, userInput, options),
      };
    return {
      data:
        action === 'create'
          ? await client.admin.roles.create(
              {
                name: roleName!,
                ...(permissions !== undefined ? { permissions } : {}),
              },
              options,
            )
          : await client.admin.roles.update(
              id!,
              { name: roleName!, permissions: permissions! },
              options,
            ),
    };
  } catch (cause) {
    throw new ManagementWriteFailure(cause, resource, id);
  }
}
