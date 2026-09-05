/** Renders human results while keeping untrusted content inert in terminal output. */
import type {
  AdminOverview,
  AdminUser,
  AdminRole,
  AdminPermission,
  Identity,
  Task,
} from './sdk/index.js';
import type { Profile } from './config.js';

/** Escapes controls in user text, leaving JSON serialization to the machine output path. */
export function safeText(value: unknown): string {
  return Array.from(String(value))
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 ||
        (code >= 127 && code <= 159) ||
        (code >= 0x2028 && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069)
        ? `\\u${code.toString(16).padStart(4, '0')}`
        : character;
    })
    .join('');
}

/** Provides actionable task summaries and readable structured output for other resources. */
export function humanResult(command: string, data: unknown): string {
  if (command === 'user delete' || command === 'role delete')
    return `已删除${command === 'user delete' ? '用户' : '角色'}：${safeText((data as { id: string }).id)}\n`;
  if (
    ['user get', 'user create', 'user update', 'user restore'].includes(command)
  ) {
    const user = data as AdminUser;
    return managementDetail([
      ['ID', user.id],
      ['用户名', `@${user.username}`],
      ['姓名', user.name],
      ['角色 ID', user.roleId],
      ['角色代码', user.roleCode],
      ['角色名称', user.roleName],
      ['启用', user.active ? '是' : '否'],
      ['删除时间', user.deletedAt ?? '—'],
      ['更新时间', user.updatedAt],
    ]);
  }
  if (
    ['role get', 'role create', 'role update', 'role restore'].includes(command)
  ) {
    const role = data as AdminRole;
    return managementDetail([
      ['ID', role.id],
      ['代码', role.code],
      ['名称', role.name],
      ['内置', role.builtin ? '是' : '否'],
      ['权限码', role.permissions.join(', ')],
      ['启用', role.active ? '是' : '否'],
      ['删除时间', role.deletedAt ?? '—'],
      ['更新时间', role.updatedAt],
    ]);
  }
  if (command === 'permission get') {
    const permission = data as AdminPermission;
    return managementDetail([
      ['代码', permission.code],
      ['名称', permission.name],
      ['描述', permission.description],
    ]);
  }
  if (command === 'admin overview') {
    const overview = data as AdminOverview;
    return `用户：\n${humanResult('user list', overview.users)}\n角色：\n${humanResult('role list', overview.roles)}\n权限：\n${humanResult('permission list', overview.permissions)}`;
  }
  if (command === 'user list')
    return managementTable(
      'ID\t用户名\t姓名\t角色 ID\t角色名称\t启用\t删除时间',
      (data as AdminUser[]).map((user) => [
        user.id,
        `@${user.username}`,
        user.name,
        user.roleId,
        user.roleName,
        user.active ? '是' : '否',
        user.deletedAt ?? '—',
      ]),
      '无用户',
    );
  if (command === 'role list')
    return managementTable(
      'ID\t代码\t名称\t内置\t权限码\t启用\t删除时间',
      (data as AdminRole[]).map((role) => [
        role.id,
        role.code,
        role.name,
        role.builtin ? '是' : '否',
        role.permissions.join(', '),
        role.active ? '是' : '否',
        role.deletedAt ?? '—',
      ]),
      '无角色',
    );
  if (command === 'permission list')
    return managementTable(
      '代码\t名称\t描述',
      (data as AdminPermission[]).map((permission) => [
        permission.code,
        permission.name,
        permission.description,
      ]),
      '无权限',
    );
  if (command === 'task list') {
    const rows = (data as Task[]).map((task) =>
      [
        task.id,
        task.title,
        task.statusLabel,
        task.assignee?.name ?? '未接取',
        task.dueDate,
        task.version,
      ]
        .map(safeText)
        .join('\t'),
    );
    return `ID\t标题\t状态\t接取者\t截止日期\t版本\n${rows.length ? rows.join('\n') : '无匹配任务'}\n`;
  }
  if (command.startsWith('task ') || command.startsWith('comment ')) {
    const task = data as Task;
    return `ID：${safeText(task.id)}\n标题：${safeText(task.title)}\n状态：${safeText(task.statusLabel)}\n接取者：${safeText(task.assignee?.name ?? '未接取')}\n截止日期：${safeText(task.dueDate)}\n版本：${task.version}\n描述：${safeText(task.description)}\n奖励：${safeText(task.reward)}\n时间线：\n${task.timeline.map((event) => (event.kind === 'activity' ? `${safeText(event.at)} ${safeText(event.actor.name)} ${safeText(event.actionLabel)} ${safeText(event.detail)}` : `${safeText(event.at)} [${safeText(event.commentId)}] @${safeText(event.actor.username)} ${event.deleted ? '[评论已删除]' : `${event.edited ? '[已编辑] ' : ''}${safeText(event.content)}`}`)).join('\n')}\n`;
  }
  if (command.startsWith('identity ')) {
    const identities = (Array.isArray(data) ? data : [data]) as Identity[];
    return `身份 ID\t姓名\t用户名\t角色\n${identities.map((identity) => [identity.id, identity.name, `@${identity.username}`, identity.roleLabel].map(safeText).join('\t')).join('\n') || '无可用身份'}\n`;
  }
  if (command === 'profile delete')
    return `已删除 profile：${safeText((data as { name: string }).name)}\n`;
  const profiles = (Array.isArray(data) ? data : [data]) as (Profile & {
    name: string;
    current: boolean;
  })[];
  return `Profile\t服务地址\t演示身份\t当前激活\n${profiles.map((profile) => [profile.name, profile.baseUrl, profile.demoUserId, profile.current ? '是' : '否'].map(safeText).join('\t')).join('\n')}\n`;
}

/** Escapes each remote cell independently while preserving table separators and empty-state text. */
function managementTable(
  header: string,
  rows: string[][],
  empty: string,
): string {
  return `${header}\n${rows.length ? rows.map((row) => row.map(safeText).join('\t')).join('\n') : empty}\n`;
}

/** Presents complete resource fields while escaping every remote value independently. */
function managementDetail(fields: [string, string][]): string {
  return `${fields.map(([label, value]) => `${label}：${safeText(value)}`).join('\n')}\n`;
}
