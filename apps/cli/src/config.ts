/** Owns versioned profile storage, resolution and atomic replacement in the user config directory. */
import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, win32 } from 'node:path';
import { normalizeBaseUrl, requireText, type Command } from './arguments.js';
import { CliError } from './errors.js';

export interface Profile {
  baseUrl: string;
  demoUserId: string;
}
export interface Config {
  version: 1;
  currentProfile: string;
  profiles: Record<string, Profile>;
}

/** Resolves platform-standard storage without silently falling back to the working directory. */
export function configPath(
  env: NodeJS.ProcessEnv,
  platform = process.platform,
  home = homedir(),
): string {
  if (env.NOTICEBOARD_CONFIG_FILE !== undefined) {
    requireText(
      env.NOTICEBOARD_CONFIG_FILE,
      'NOTICEBOARD_CONFIG_FILE',
      'config',
    );
    if (!isAbsolute(env.NOTICEBOARD_CONFIG_FILE))
      throw new CliError('config', 'NOTICEBOARD_CONFIG_FILE 必须是绝对路径');
    return env.NOTICEBOARD_CONFIG_FILE;
  }
  if (platform === 'win32') {
    if (!env.APPDATA || !win32.isAbsolute(env.APPDATA))
      throw new CliError('config', 'APPDATA 必须指向用户应用配置目录');
    return win32.join(env.APPDATA, 'noticeboard', 'config.json');
  }
  if (platform === 'darwin')
    return join(
      home,
      'Library',
      'Application Support',
      'noticeboard',
      'config.json',
    );
  const root = env.XDG_CONFIG_HOME || join(home, '.config');
  if (!isAbsolute(root))
    throw new CliError('config', 'XDG_CONFIG_HOME 必须是绝对路径');
  return join(root, 'noticeboard', 'config.json');
}

/** Creates fresh in-memory demo defaults; reads never persist this object implicitly. */
function defaults(): Config {
  return {
    version: 1,
    currentProfile: 'local',
    profiles: {
      local: {
        baseUrl: 'http://127.0.0.1:3000',
        demoUserId: 'noticeboard-master',
      },
    },
  };
}

/** Narrows arbitrary JSON objects without trusting inherited profile names. */
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Fails closed on corrupt schemas and unknown fields instead of dropping stored information. */
function validateConfig(value: unknown): Config {
  if (
    !record(value) ||
    value.version !== 1 ||
    !record(value.profiles) ||
    Object.keys(value).some(
      (key) => !['version', 'currentProfile', 'profiles'].includes(key),
    )
  )
    throw new CliError('config', '配置格式或版本不受支持');
  requireText(value.currentProfile, 'currentProfile', 'config');
  const profiles: Record<string, Profile> = Object.create(null) as Record<
    string,
    Profile
  >;
  for (const [name, profile] of Object.entries(value.profiles)) {
    requireText(name, 'profile 名称', 'config');
    if (
      !record(profile) ||
      Object.keys(profile).some(
        (key) => !['baseUrl', 'demoUserId'].includes(key),
      )
    )
      throw new CliError('config', 'profile 格式无效');
    requireText(profile.baseUrl, 'baseUrl', 'config');
    requireText(profile.demoUserId, 'demoUserId', 'config');
    normalizeBaseUrl(profile.baseUrl, 'config');
    profiles[name] = {
      baseUrl: profile.baseUrl,
      demoUserId: profile.demoUserId,
    };
  }
  if (!Object.hasOwn(profiles, value.currentProfile))
    throw new CliError('config', 'currentProfile 指向不存在的 profile');
  return { version: 1, currentProfile: value.currentProfile, profiles };
}

/** Treats only ENOENT as first use; all other failures preserve the user's file. */
export async function readConfig(path: string): Promise<Config> {
  let raw: string;
  try {
    raw = await fs.readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return validateConfig(defaults());
    throw new CliError('config', '无法读取配置文件，请检查路径和权限');
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new CliError('config', '配置文件不是有效 JSON');
  }
  return validateConfig(value);
}

/** Atomically replaces one fully validated snapshot and cleans only its own temporary file. */
export async function writeConfig(path: string, config: Config): Promise<void> {
  const valid = validateConfig(config);
  const temporary = join(dirname(path), `.noticeboard-${randomUUID()}.tmp`);
  try {
    await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const file = await fs.open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(`${JSON.stringify(valid, null, 2)}\n`);
      await file.sync();
    } finally {
      await file.close();
    }
    await fs.rename(temporary, path);
  } catch {
    throw new CliError('config', '无法原子保存配置，请检查目录和文件权限');
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

/** Selects an existing profile; explicit missing names never fall back to local. */
export function selectedProfile(
  config: Config,
  command: Command,
  env: NodeJS.ProcessEnv,
): string {
  const name =
    command.options.profile ?? env.NOTICEBOARD_PROFILE ?? config.currentProfile;
  requireText(name, 'profile 名称', 'config');
  if (!Object.hasOwn(config.profiles, name))
    throw new CliError('config', '指定的 profile 不存在');
  return name;
}

/** Resolves request-only overrides and shares Fetch's normalized identity with local comparisons. */
export function requestProfile(
  config: Config,
  command: Command,
  env: NodeJS.ProcessEnv,
): Profile {
  const profile = config.profiles[selectedProfile(config, command, env)]!;
  const baseUrl = normalizeBaseUrl(
    command.options['base-url'] ?? env.NOTICEBOARD_BASE_URL ?? profile.baseUrl,
    'config',
  );
  const demoUserId =
    command.options.user ?? env.NOTICEBOARD_USER ?? profile.demoUserId;
  requireText(
    demoUserId,
    '身份；请使用 identity list 和 identity use',
    'config',
  );
  try {
    const headers = new Headers({ 'X-Demo-User-Id': demoUserId });
    return { baseUrl, demoUserId: headers.get('X-Demo-User-Id')! };
  } catch {
    throw new CliError('config', '身份必须是有效 HTTP 请求头文本');
  }
}
