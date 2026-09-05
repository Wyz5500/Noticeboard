/** Selects management reads from a validated SDK snapshot without changing server state or ordering. */
import type { Command } from './arguments.js';
import { CliError } from './errors.js';
import type {
  AdminOverview,
  AdminUser,
  AdminRole,
  AdminPermission,
} from './sdk/index.js';

/** Limits overview routing to the explicit management command surface. */
export function isManagementCommand(name: string): boolean {
  return [
    'admin overview',
    'user list',
    'user get',
    'role list',
    'role get',
    'permission list',
    'permission get',
  ].includes(name);
}

/** Selects exact keys or AND-combined local filters only after the entire overview has been validated. */
export function selectManagementResult(
  command: Command,
  overview: AdminOverview,
): unknown {
  if (command.name === 'admin overview') return overview;
  const resource = command.name.split(' ')[0];
  const records: (AdminUser | AdminRole | AdminPermission)[] =
    resource === 'user'
      ? overview.users
      : resource === 'role'
        ? overview.roles
        : overview.permissions;
  if (command.name.endsWith(' get')) {
    const record = records.find(
      (item) => ('id' in item ? item.id : item.code) === command.operands[0],
    );
    if (!record)
      throw new CliError(
        'usage',
        '指定的管理资源不存在，请使用对应的 list 命令查看',
        66,
      );
    return record;
  }
  const search = (command.options.search ?? '')
    .trim()
    .toLocaleLowerCase('zh-CN');
  return records.filter((record) => {
    if (
      'active' in record &&
      (!matchesState(record.active, command.options.active) ||
        !matchesState(record.deletedAt !== null, command.options.deleted))
    )
      return false;
    const fields =
      'username' in record
        ? [
            record.id,
            record.username,
            record.name,
            record.roleId,
            record.roleCode,
            record.roleName,
          ]
        : 'permissions' in record
          ? [record.id, record.code, record.name, ...record.permissions]
          : [record.code, record.name, record.description];
    return fields.join(' ').toLocaleLowerCase('zh-CN').includes(search);
  });
}

/** Keeps enabled and deleted filters independent, with omitted or all values retaining every record. */
function matchesState(value: boolean, filter: string | undefined): boolean {
  return (
    filter === undefined || filter === 'all' || value === (filter === 'true')
  );
}
