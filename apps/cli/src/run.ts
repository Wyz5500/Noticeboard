/** Coordinates CLI commands with explicit process boundaries. */
import {
  helpText,
  parseCommand,
  normalizeBaseUrl,
  type Command,
} from './arguments.js';
import {
  configPath,
  readConfig,
  requestProfile,
  selectedProfile,
  writeConfig,
  type Config,
} from './config.js';
import { CliError, describeError } from './errors.js';
import { humanResult, safeText } from './output.js';
import { createNoticeboardClient } from './sdk/index.js';
import { filterTasks } from './tasks.js';
import { isWriteCommand, writeCommand } from './write-commands.js';
export interface CliContext {
  env: NodeJS.ProcessEnv;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  isTTY: boolean;
  confirm: (question: string) => Promise<boolean>;
  fetch: typeof globalThis.fetch;
  /** Supplies stdin on demand; omitted by callers that only execute commands without stdin input. */
  readStdin?: () => Promise<string>;
}

/** Returns the command exit status without terminating its caller. */
export async function runCli(
  args: string[],
  context: CliContext,
): Promise<number> {
  let json = args.includes('--json');
  try {
    const command = parseCommand(args);
    json = command.options.json ?? false;
    if (command.options.help) {
      const help = helpText(command.name);
      context.stdout(json ? `${JSON.stringify({ data: { help } })}\n` : help);
      return 0;
    }
    const path = configPath(context.env);
    const config = await readConfig(path);
    const result = isWriteCommand(command.name)
      ? await writeCommand(command, config, context)
      : {
          data: command.name.startsWith('profile ')
            ? await profileCommand(command, config, path, context)
            : await remoteCommand(command, config, path, context),
        };
    context.stdout(
      json
        ? `${JSON.stringify(result)}\n`
        : humanResult(command.name, result.data),
    );
    return 0;
  } catch (error) {
    const failure = describeError(error);
    context.stderr(
      json
        ? `${JSON.stringify(failure)}\n`
        : `错误：${safeText(failure.error.message)}${failure.error.code ? ` (${safeText(failure.error.code)})` : ''}${failure.error.hint ? `；${safeText(failure.error.hint)}` : ''}\n`,
    );
    return failure.meta.exitCode;
  }
}

/** Applies explicit profile mutations without persisting environment overrides or dangling references. */
async function profileCommand(
  command: Command,
  config: Config,
  path: string,
  context: CliContext,
): Promise<unknown> {
  const name = command.operands[0];
  if (command.name === 'profile list')
    return Object.entries(config.profiles).map(([name, profile]) => ({
      name,
      ...profile,
      current: name === config.currentProfile,
    }));
  if (command.name === 'profile show') {
    const target = name ?? selectedProfile(config, command, context.env);
    if (!Object.hasOwn(config.profiles, target))
      throw new CliError('config', '指定的 profile 不存在');
    return {
      name: target,
      ...config.profiles[target],
      current: target === config.currentProfile,
    };
  }
  if (!name) throw new CliError('usage', '缺少 profile 名称');
  if (command.name === 'profile set') {
    config.profiles[name] = {
      baseUrl: normalizeBaseUrl(command.options['base-url']!, 'usage'),
      demoUserId:
        command.options.user ??
        config.profiles[name]?.demoUserId ??
        'noticeboard-master',
    };
  } else {
    if (!Object.hasOwn(config.profiles, name))
      throw new CliError('config', '指定的 profile 不存在');
    if (command.name === 'profile use') config.currentProfile = name;
    else {
      if (name === config.currentProfile)
        throw new CliError(
          'config',
          '不能删除当前激活 profile，请先使用 profile use 切换',
        );
      if (!command.options.yes) {
        if (!context.isTTY || command.options.json)
          throw new CliError('usage', '非交互或 JSON 删除必须提供 --yes');
        if (
          !(await context.confirm(`确认删除 profile ${safeText(name)}？[y/N] `))
        )
          throw new CliError('usage', '已取消删除');
      }
      delete config.profiles[name];
    }
  }
  await writeConfig(path, config);
  return command.name === 'profile delete'
    ? { ok: true, name }
    : {
        name,
        ...config.profiles[name],
        current: config.currentProfile === name,
      };
}

/** Calls only public SDK resources with bounded, unretried requests and explicit identity persistence. */
async function remoteCommand(
  command: Command,
  config: Config,
  path: string,
  context: CliContext,
): Promise<unknown> {
  if (
    command.name === 'identity use' &&
    selectedProfile(config, command, context.env) !== config.currentProfile
  )
    throw new CliError(
      'config',
      'identity use 只修改当前激活 profile，请先使用 profile use 切换',
    );
  const profile = requestProfile(config, command, context.env);
  const client = createNoticeboardClient({
    baseUrl: profile.baseUrl,
    fetch: context.fetch,
    getHeaders: () => ({ 'X-Demo-User-Id': profile.demoUserId }),
  });
  const options = { signal: AbortSignal.timeout(30_000) };
  if (
    ['admin overview', 'user list', 'role list', 'permission list'].includes(
      command.name,
    )
  ) {
    const overview = await client.admin.overview(options);
    switch (command.name) {
      case 'user list':
        return overview.users;
      case 'role list':
        return overview.roles;
      case 'permission list':
        return overview.permissions;
      default:
        return overview;
    }
  }
  if (command.name === 'task get')
    return client.tasks.get(command.operands[0]!, options);
  if (command.name === 'task list') {
    const tasks = await client.tasks.list(options);
    const identities = command.options.mine
      ? await client.identities.list(options)
      : [];
    return filterTasks(tasks, identities, profile.demoUserId, command.options);
  }
  const identities = await client.identities.list(options);
  if (command.name === 'identity list') return identities;
  const id =
    command.name === 'identity use' ? command.operands[0] : profile.demoUserId;
  const identity = identities.find((identity) => identity.id === id);
  if (!identity)
    throw new CliError(
      'usage',
      '身份无效，请使用 identity list 查看并通过 identity use 选择',
      77,
    );
  if (command.name === 'identity use') {
    config.profiles[config.currentProfile]!.demoUserId = identity.id;
    await writeConfig(path, config);
  }
  return identity;
}
