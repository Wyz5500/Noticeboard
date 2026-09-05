/** Handles local write inputs and one-shot optimistic HTTP commands through the SDK public boundary. */
import { readFile } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import type { Command } from './arguments.js';
import { requireText } from './arguments.js';
import { requestProfile, type Config } from './config.js';
import { CliError, WriteFailure } from './errors.js';
import { safeText } from './output.js';
import type { CliContext } from './run.js';
import {
  createNoticeboardClient,
  type Task,
  type TaskAction,
  type TaskType,
  type TaskRecoveryStrategy,
} from './sdk/index.js';

export interface WriteResult {
  data: Task;
  meta?: { expectedVersion: number };
}

/** Selects only the six supported remote write commands. */
export function isWriteCommand(name: string): boolean {
  return [
    'task create',
    'task act',
    'task renew',
    'comment create',
    'comment edit',
    'comment delete',
  ].includes(name);
}

/** Decodes raw stdin strictly so malformed bytes cannot be silently persisted. */
export async function readStdin(input: Readable): Promise<string> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let content = '';
  for await (const chunk of input)
    content += decoder.decode(chunk as Uint8Array, { stream: true });
  return content + decoder.decode();
}

/** Accepts decimal positive safe integers only, before consuming local input or making requests. */
function expectedVersion(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1)
    throw new CliError('usage', '--expected-version 必须是正安全整数');
  return number;
}

/** Checks stable machine enums without importing server code or reproducing business rules. */
function enumeration<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  label: string,
): T {
  if (!allowed.includes(value as T))
    throw new CliError('usage', `${label} 必须为：${allowed.join(', ')}`);
  return value as T;
}

/** Requires a wire-format date while leaving calendar and business-time validation to the API. */
function dueDate(value: string | undefined): string {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new CliError('usage', '--due-date 必须使用 yyyy-mm-dd 格式');
  return value;
}

/** Reads exactly one selected source and preserves multiline content for server normalization. */
async function textInput(
  command: Command,
  field: 'description' | 'content',
  context: CliContext,
): Promise<string> {
  const direct = command.options[field];
  const file = command.options[`${field}-file`];
  if ((direct === undefined) === (file === undefined))
    throw new CliError('usage', `必须且只能提供 --${field} 或 --${field}-file`);
  let text: string;
  try {
    text =
      direct ??
      (file === '-'
        ? await context.readStdin!()
        : new TextDecoder('utf-8', { fatal: true }).decode(
            await readFile(file!),
          ));
  } catch {
    throw new CliError('usage', `无法读取 --${field}-file 的 UTF-8 正文`);
  }
  if (!text.trim() || text.includes('\0'))
    throw new CliError('usage', `${field} 必须是非空且不含 NUL 的正文`);
  return text;
}

/** Validates and confirms locally, then performs at most one pre-read followed by one write. */
export async function writeCommand(
  command: Command,
  config: Config,
  context: CliContext,
): Promise<WriteResult> {
  const profile = requestProfile(config, command, context.env);
  const suppliedVersion = expectedVersion(command.options['expected-version']);
  const taskId = command.operands[0]!;
  const commentId = command.operands[1]!;
  let creation;
  let action: TaskAction | undefined;
  let renewal;
  let content: string | undefined;
  if (command.name === 'task create') {
    requireText(command.options.title, '--title', 'usage');
    requireText(command.options.reward, '--reward', 'usage');
    const type = enumeration<TaskType>(
      command.options.type,
      ['exploration', 'collection', 'escort', 'bounty', 'building'],
      '--type',
    );
    const date = dueDate(command.options['due-date']);
    creation = {
      title: command.options.title,
      type,
      reward: command.options.reward,
      dueDate: date,
      description: await textInput(command, 'description', context),
    };
  } else if (command.name === 'task act') {
    action = enumeration<TaskAction>(
      command.operands[1],
      ['accept', 'complete', 'approve', 'reopen', 'close'],
      'action',
    );
  } else if (command.name === 'task renew') {
    renewal = {
      dueDate: dueDate(command.options['due-date']),
      recoveryStrategy: enumeration<TaskRecoveryStrategy>(
        command.options['recovery-strategy'],
        ['preserve_status', 'reopened'],
        '--recovery-strategy',
      ),
    };
  } else if (command.name === 'comment delete') {
    if (!command.options.yes) {
      if (!context.isTTY || command.options.json)
        throw new CliError('usage', '非交互或 JSON 删除必须提供 --yes');
      if (
        !(await context.confirm(
          `确认删除任务 ${safeText(taskId)} 的评论 ${safeText(commentId)}？[y/N] `,
        ))
      )
        throw new CliError('usage', '已取消删除');
    }
  } else {
    content = await textInput(command, 'content', context);
  }
  const client = createNoticeboardClient({
    baseUrl: profile.baseUrl,
    fetch: context.fetch,
    getHeaders: () => ({ 'X-Demo-User-Id': profile.demoUserId }),
  });
  const options = { signal: AbortSignal.timeout(30_000) };
  const version = creation
    ? undefined
    : (suppliedVersion ?? (await client.tasks.get(taskId, options)).version);
  try {
    if (creation) return { data: await client.tasks.create(creation, options) };
    const input = { expectedVersion: version! };
    const data = action
      ? await client.tasks.act(taskId, { ...input, action }, options)
      : renewal
        ? await client.tasks.renew(taskId, { ...input, ...renewal }, options)
        : command.name === 'comment create'
          ? await client.comments.create(
              taskId,
              { ...input, content: content! },
              options,
            )
          : command.name === 'comment edit'
            ? await client.comments.edit(
                taskId,
                commentId,
                { ...input, content: content! },
                options,
              )
            : await client.comments.delete(taskId, commentId, input, options);
    return { data, meta: { expectedVersion: version! } };
  } catch (cause) {
    throw new WriteFailure(cause, taskId, version);
  }
}
