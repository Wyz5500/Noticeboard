/** Renders human results while keeping untrusted content inert in terminal output. */
import stringWidth from 'string-width';
import type {
  DemoResetResult,
  AdminOverview,
  AdminUser,
  AdminRole,
  AdminPermission,
  Identity,
  Task,
} from './sdk/index.js';
import type { Profile } from './config.js';

/** Wraps all human text to the stream width while reusing existing outer table rules. */
export function frameHumanOutput(text: string, columns?: number): string {
  const limit = validColumns(columns);
  if (limit !== undefined) {
    for (const { segment } of graphemes.segment(text)) {
      if (stringWidth(segment) > limit) {
        text = narrowNotice(limit);
        break;
      }
    }
  }
  const lines = text
    .replace(/\n+$/, '')
    .split('\n')
    .flatMap((line) => {
      if (limit === undefined) return [line];
      if (/^[-+]+$/.test(line))
        return [line.length > limit ? '-'.repeat(limit) : line];
      return wrapTextLine(line, limit);
    });
  let width = 1;
  for (const line of lines) width = Math.max(width, stringWidth(line));
  const rule = '-'.repeat(Math.min(width, limit ?? width));
  if (!/^[-+]+$/.test(lines[0]!)) lines.unshift(rule);
  if (!/^[-+]+$/.test(lines.at(-1)!)) lines.push(rule);
  return `${lines.join('\n')}\n`;
}

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
export function humanResult(
  command: string,
  data: unknown,
  columns?: number,
): string {
  if (command === 'demo reset')
    return (data as DemoResetResult).reset
      ? '已重置全部任务及时间线为演示数据。\n'
      : '服务器返回未重置（reset=false）。\n';
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
    return `用户：\n${humanResult('user list', overview.users, columns)}\n角色：\n${humanResult('role list', overview.roles, columns)}\n权限：\n${humanResult('permission list', overview.permissions, columns)}`;
  }
  if (command === 'user list')
    return humanTable(
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
      columns,
    );
  if (command === 'role list')
    return humanTable(
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
      columns,
    );
  if (command === 'permission list')
    return humanTable(
      'ID\t名称\t描述',
      (data as AdminPermission[]).map((permission) => [
        permission.code,
        permission.name,
        permission.description,
      ]),
      '无权限',
      columns,
    );
  if (command === 'task list') {
    const rows = (data as Task[]).map((task) => [
      task.id,
      task.title,
      task.statusLabel,
      task.assignee?.name ?? '未接取',
      task.dueDate,
      task.version,
    ]);
    return humanTable(
      'ID\t标题\t状态\t接取者\t截止日期\t版本',
      rows,
      '无匹配任务',
      columns,
    );
  }
  if (command.startsWith('task ') || command.startsWith('comment ')) {
    const task = data as Task;
    return `ID：${safeText(task.id)}\n标题：${safeText(task.title)}\n状态：${safeText(task.statusLabel)}\n接取者：${safeText(task.assignee?.name ?? '未接取')}\n截止日期：${safeText(task.dueDate)}\n版本：${task.version}\n描述：${safeText(task.description)}\n奖励：${safeText(task.reward)}\n时间线：\n${task.timeline.map((event) => (event.kind === 'activity' ? `${safeText(event.at)} ${safeText(event.actor.name)} ${safeText(event.actionLabel)} ${safeText(event.detail)}` : `${safeText(event.at)} [${safeText(event.commentId)}] @${safeText(event.actor.username)} ${event.deleted ? '[评论已删除]' : `${event.edited ? '[已编辑] ' : ''}${safeText(event.content)}`}`)).join('\n')}\n`;
  }
  if (command.startsWith('identity ')) {
    const identities = (Array.isArray(data) ? data : [data]) as Identity[];
    return humanTable(
      'ID\t姓名\t用户名\t角色',
      identities.map((identity) => [
        identity.id,
        identity.name,
        `@${identity.username}`,
        identity.roleLabel,
      ]),
      '无可用身份',
      columns,
    );
  }
  if (command === 'profile delete')
    return `已删除 profile：${safeText((data as { name: string }).name)}\n`;
  const profiles = (Array.isArray(data) ? data : [data]) as (Profile & {
    name: string;
    current: boolean;
  })[];
  return humanTable(
    'ID\t服务地址\t演示身份\t当前激活',
    profiles.map((profile) => [
      profile.name,
      profile.baseUrl,
      profile.demoUserId,
      profile.current ? '是' : '否',
    ]),
    '',
    columns,
  );
}

/** Accepts only usable terminal column counts; unknown widths preserve unbounded output. */
function validColumns(columns?: number): number | undefined {
  return columns !== undefined && Number.isSafeInteger(columns) && columns > 0
    ? columns
    : undefined;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Wraps whole graphemes without discarding whitespace or escaped remote content. */
function wrapCell(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const { segment } of graphemes.segment(text)) {
    if (line && stringWidth(line + segment) > width) {
      lines.push(line);
      line = '';
    }
    line += segment;
  }
  lines.push(line);
  return lines;
}

/** Repeats usable prose indentation on continuation lines, retaining explicit paragraph breaks. */
function wrapTextLine(text: string, width: number): string[] {
  if (stringWidth(text) <= width) return [text];
  const indent = /^ */.exec(text)![0];
  let widest = 1;
  for (const { segment } of graphemes.segment(text)) {
    widest = Math.max(widest, stringWidth(segment));
  }
  if (indent.length + widest > width) return wrapCell(text, width);
  return wrapCell(text.slice(indent.length), width - indent.length).map(
    (line) => indent + line,
  );
}

/** Keeps an actionable notice printable even when a double-width character cannot fit. */
function narrowNotice(columns: number): string {
  const text =
    columns === 1
      ? 'Terminal too narrow. Enlarge terminal or use --json.'
      : '终端过窄，请扩大窗口或使用 --json 查看完整数据。';
  return `${wrapCell(text, columns).join('\n')}\n`;
}

/** Fits escaped cells into terminal columns and pads continuation lines within each record. */
function humanTable(
  header: string,
  rows: unknown[][],
  empty: string,
  columns?: number,
): string {
  const limit = validColumns(columns);
  const cells = [header.split('\t'), ...rows].map((row) => row.map(safeText));
  const widths = cells[0]!.map(() => 0);
  const minimums = widths.map(() => 1);
  for (const row of cells) {
    row.forEach((text, column) => {
      widths[column] = Math.max(widths[column]!, stringWidth(text));
      for (const { segment } of graphemes.segment(text)) {
        minimums[column] = Math.max(minimums[column]!, stringWidth(segment));
      }
    });
  }
  const gaps = 3 * (widths.length - 1);
  if (limit !== undefined) {
    if (minimums.reduce((sum, width) => sum + width, gaps) > limit) {
      return narrowNotice(limit);
    }
    let total = widths.reduce((sum, width) => sum + width, gaps);
    while (total > limit) {
      let widest = -1;
      widths.forEach((width, column) => {
        if (
          width > minimums[column]! &&
          (widest < 0 || width > widths[widest]!)
        )
          widest = column;
      });
      widths[widest]!--;
      total--;
    }
  }
  const blocks = cells.map((row) => {
    const wrapped = row.map((text, column) => wrapCell(text, widths[column]!));
    const height = Math.max(...wrapped.map((cell) => cell.length));
    return Array.from({ length: height }, (_, index) =>
      wrapped
        .map((cell, column) => {
          const text = cell[index] ?? '';
          return column === row.length - 1
            ? text
            : text +
                ' '.repeat(widths[column]! - stringWidth(text)) +
                (column === 0 ? ' | ' : '   ');
        })
        .join(''),
    );
  });
  const rule = widths
    .map(
      (width, column) =>
        (column === 0 ? '' : column === 1 ? '-+-' : '---') + '-'.repeat(width),
    )
    .join('');
  const lines = [rule, ...blocks[0]!, rule, ...blocks.slice(1).flat()];
  if (!rows.length) lines.push(...wrapCell(empty, limit ?? Infinity));
  lines.push(rule);
  return `${lines.join('\n')}\n`;
}

/** Presents complete resource fields while escaping every remote value independently. */
function managementDetail(fields: [string, string][]): string {
  return `${fields.map(([label, value]) => `${label}：${safeText(value)}`).join('\n')}\n`;
}
