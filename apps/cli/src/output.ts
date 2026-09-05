/** Renders human results while keeping untrusted content inert in terminal output. */
import type { Identity, Task } from './sdk/index.js';
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
