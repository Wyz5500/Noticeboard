/** Parses the command surface independently of files, network and output. */
import { parseArgs } from 'node:util';
import { COMMANDS, PUBLIC_OPTIONS, RESOURCES } from './command-catalog.js';
import { CliError } from './errors.js';
import { createNoticeboardClient, type TaskStatus } from './sdk/index.js';

const OPTIONS = {
  name: { type: 'string' },
  'role-id': { type: 'string' },
  permissions: { type: 'string' },
  'clear-permissions': { type: 'boolean' },
  profile: { type: 'string' },
  'base-url': { type: 'string' },
  user: { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  mine: { type: 'boolean' },
  status: { type: 'string' },
  search: { type: 'string' },
  active: { type: 'string' },
  deleted: { type: 'string' },
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
  const [resource, action, ...rest] = parsed.positionals;
  const name =
    resource === 'man' ? 'man' : [resource, action].filter(Boolean).join(' ');
  const operands = resource === 'man' ? parsed.positionals.slice(1) : rest;
  const shape = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (!name || (parsed.values.help && RESOURCES.includes(name))) {
    if ([...seen].some((option) => !PUBLIC_OPTIONS.includes(option)))
      throw new CliError('usage', '此选项需要对应的子命令');
    return { name, operands, options: { ...parsed.values, help: true } };
  }
  if (!shape) throw new CliError('usage', '未知命令，请使用 --help 查看用法');
  for (const name of seen)
    if (![...PUBLIC_OPTIONS, ...(shape.options ?? [])].includes(name))
      throw new CliError('usage', `当前命令不支持 --${name}`);
  if (name === 'man') {
    for (const operand of operands) requireText(operand, '手册主题', 'usage');
    const topic = operands.join(' ');
    if (
      operands.length > 2 ||
      (topic && !RESOURCES.includes(topic) && !Object.hasOwn(COMMANDS, topic))
    )
      throw new CliError(
        'usage',
        '未知手册主题，请使用 noticeboard man --help 查看用法',
      );
    return { name, operands, options: parsed.values };
  }
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
  for (const option of ['active', 'deleted'] as const)
    if (
      parsed.values[option] !== undefined &&
      !['true', 'false', 'all'].includes(parsed.values[option])
    )
      throw new CliError('usage', `--${option} 可选：true, false, all`);
  return { name, operands, options: parsed.values };
}
