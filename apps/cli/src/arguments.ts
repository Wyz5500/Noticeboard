/** Parses the command surface independently of files, network and output. */
import { parseArgs } from 'node:util';
import { CliError } from './errors.js';
import { createNoticeboardClient, type TaskStatus } from './sdk/index.js';

const OPTIONS = {
  profile: { type: 'string' },
  'base-url': { type: 'string' },
  user: { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  mine: { type: 'boolean' },
  status: { type: 'string' },
  search: { type: 'string' },
  yes: { type: 'boolean' },
  title: { type: 'string' },
  type: { type: 'string' },
  reward: { type: 'string' },
  'due-date': { type: 'string' },
  description: { type: 'string' },
  'description-file': { type: 'string' },
  content: { type: 'string' },
  'content-file': { type: 'string' },
  'expected-version': { type: 'string' },
  'recovery-strategy': { type: 'string' },
} as const;
const COMMANDS: Record<
  string,
  { min: number; max: number; options?: string[] }
> = {
  'profile list': { min: 0, max: 0 },
  'profile show': { min: 0, max: 1 },
  'profile set': { min: 1, max: 1 },
  'profile use': { min: 1, max: 1 },
  'profile delete': { min: 1, max: 1, options: ['yes'] },
  'identity list': { min: 0, max: 0 },
  'identity current': { min: 0, max: 0 },
  'identity use': { min: 1, max: 1 },
  'task list': { min: 0, max: 0, options: ['mine', 'status', 'search'] },
  'task get': { min: 1, max: 1 },
  'task create': {
    min: 0,
    max: 0,
    options: [
      'title',
      'type',
      'reward',
      'due-date',
      'description',
      'description-file',
    ],
  },
  'task act': { min: 2, max: 2, options: ['expected-version'] },
  'task renew': {
    min: 1,
    max: 1,
    options: ['due-date', 'recovery-strategy', 'expected-version'],
  },
  'comment create': {
    min: 1,
    max: 1,
    options: ['content', 'content-file', 'expected-version'],
  },
  'comment edit': {
    min: 2,
    max: 2,
    options: ['content', 'content-file', 'expected-version'],
  },
  'comment delete': { min: 2, max: 2, options: ['expected-version', 'yes'] },
};
const STATUSES: readonly TaskStatus[] = [
  'not_started',
  'in_progress',
  'completed',
  'reopened',
  'closed',
  'expired',
];
export interface Command {
  name: string;
  operands: string[];
  options: ReturnType<typeof parseOptions>['values'];
}

/** Uses native tokenization so duplicate options and values cannot bypass validation. */
function parseOptions(args: string[]) {
  try {
    return parseArgs({
      args,
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
      tokens: true,
    });
  } catch {
    throw new CliError('usage', '命令参数无效，请使用 --help 查看用法');
  }
}

/** Checks URL syntax using the SDK public contract without making a request. */
export function normalizeBaseUrl(
  value: string,
  kind: 'usage' | 'config',
): string {
  try {
    createNoticeboardClient({ baseUrl: value });
    return value.replace(/\/+$/, '');
  } catch {
    throw new CliError(
      kind,
      'base URL 必须是无凭据、查询和 fragment 的绝对 HTTP(S) 地址',
    );
  }
}

/** Validates identifiers before they become headers, config keys or positional inputs. */
export function requireText(
  value: unknown,
  label: string,
  kind: 'usage' | 'config',
): asserts value is string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) <= 31 ||
        (character.charCodeAt(0) >= 127 && character.charCodeAt(0) <= 159),
    )
  )
    throw new CliError(kind, `${label} 必须是非空且不含控制字符的文本`);
}

/** Rejects unsupported syntax before any config or HTTP side effect. */
export function parseCommand(args: string[]): Command {
  const parsed = parseOptions(args);
  const seen = new Set<string>();
  for (const token of parsed.tokens) {
    if (token.kind !== 'option') continue;
    if (seen.has(token.name))
      throw new CliError('usage', `选项重复：--${token.name}`);
    seen.add(token.name);
  }
  const [resource, action, ...operands] = parsed.positionals;
  const name = [resource, action].filter(Boolean).join(' ');
  const shape = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (
    !name ||
    (parsed.values.help &&
      ['profile', 'identity', 'task', 'comment'].includes(name))
  ) {
    if (
      [...seen].some(
        (option) =>
          !['profile', 'base-url', 'user', 'json', 'help'].includes(option),
      )
    )
      throw new CliError('usage', '此选项需要对应的子命令');
    return { name, operands, options: { ...parsed.values, help: true } };
  }
  if (!shape) throw new CliError('usage', '未知命令，请使用 --help 查看用法');
  for (const name of seen)
    if (
      ![
        'profile',
        'base-url',
        'user',
        'json',
        'help',
        ...(shape.options ?? []),
      ].includes(name)
    )
      throw new CliError('usage', `当前命令不支持 --${name}`);
  if (parsed.values.help) return { name, operands, options: parsed.values };
  if (operands.length < shape.min || operands.length > shape.max)
    throw new CliError('usage', '位置参数数量不正确，请使用 --help 查看用法');
  for (const operand of operands) requireText(operand, '位置参数', 'usage');
  for (const name of ['profile', 'user'] as const)
    if (parsed.values[name] !== undefined)
      requireText(parsed.values[name], name, 'usage');
  if (parsed.values['base-url'] !== undefined)
    normalizeBaseUrl(parsed.values['base-url'], 'usage');
  if (name === 'profile set' && !parsed.values['base-url'])
    throw new CliError('usage', 'profile set 必须提供 --base-url');
  if (
    parsed.values.status !== undefined &&
    !STATUSES.includes(parsed.values.status as TaskStatus)
  )
    throw new CliError('usage', `无效状态；可选：${STATUSES.join(', ')}`);
  return { name, operands, options: parsed.values };
}

/** Produces resource-specific help without loading config or contacting a server. */
export function helpText(name: string): string {
  const resource = name.split(' ')[0];
  const lines = [
    'profile list',
    'profile show [name]',
    'profile set <name> --base-url <url> [--user <user-id>]',
    'profile use <name>',
    'profile delete <name> [--yes]',
    'identity list',
    'identity current',
    'identity use <user-id>',
    'task list [--mine] [--status <status>] [--search <text>]',
    'task get <task-id>',
    'task create --title <text> --type <type> --reward <text> --due-date <yyyy-mm-dd> (--description <text> | --description-file <path|->)',
    'task act <task-id> <action> [--expected-version <number>]',
    'task renew <task-id> --due-date <yyyy-mm-dd> --recovery-strategy <strategy> [--expected-version <number>]',
    'comment create <task-id> (--content <text> | --content-file <path|->) [--expected-version <number>]',
    'comment edit <task-id> <comment-id> (--content <text> | --content-file <path|->) [--expected-version <number>]',
    'comment delete <task-id> <comment-id> [--expected-version <number>] [--yes]',
  ].filter((line) => !resource || line.startsWith(`${resource} `));
  return `用法：noticeboard <资源> <命令> [选项]\n\n${lines.map((line) => `  noticeboard ${line}`).join('\n')}\n\n公共选项：--profile <name> --base-url <url> --user <user-id> --json --help\n状态：${STATUSES.join(', ')}\n类型：exploration, collection, escort, bounty, building\n动作：accept, complete, approve, reopen, close\n续期策略：preserve_status, reopened\n写操作不重试；省略版本时只预读一次。评论删除在非 TTY 或 JSON 模式必须提供 --yes。\nHTTP 客户端；身份为 demo-only。\n`;
}
