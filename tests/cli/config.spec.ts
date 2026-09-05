/** Verifies platform storage and failed atomic replacements using real temporary files. */
import * as fs from 'node:fs/promises';
import type * as FileSystem from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import {
  configPath,
  readConfig,
  writeConfig,
} from '../../apps/cli/src/config.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof FileSystem>();
  return { ...original, rename: vi.fn(original.rename) };
});

/** Platform paths must never resolve into an incidental working directory. */
it('uses XDG, macOS and Windows user config locations', () => {
  expect(configPath({}, 'linux', '/users/demo')).toBe(
    '/users/demo/.config/noticeboard/config.json',
  );
  expect(configPath({ XDG_CONFIG_HOME: '/xdg' }, 'linux', '/users/demo')).toBe(
    '/xdg/noticeboard/config.json',
  );
  expect(configPath({}, 'darwin', '/users/demo')).toBe(
    '/users/demo/Library/Application Support/noticeboard/config.json',
  );
  expect(
    configPath({ APPDATA: 'C:\\Users\\demo\\AppData\\Roaming' }, 'win32'),
  ).toBe('C:\\Users\\demo\\AppData\\Roaming\\noticeboard\\config.json');
  expect(() => configPath({ NOTICEBOARD_CONFIG_FILE: 'local.json' })).toThrow();
  expect(() => configPath({ XDG_CONFIG_HOME: 'relative' }, 'linux')).toThrow();
  expect(() => configPath({}, 'win32')).toThrow();
});

/** Rename failure must preserve old bytes and remove the failed writer's temporary file. */
it('preserves the previous config when atomic replacement fails', async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'noticeboard-atomic-'));
  const path = join(directory, 'config.json');
  try {
    const config = await readConfig(path);
    await writeConfig(path, config);
    const before = await fs.readFile(path, 'utf8');
    config.profiles.local!.demoUserId = 'changed';
    vi.mocked(fs.rename).mockRejectedValueOnce(
      Object.assign(new Error('denied'), { code: 'EACCES' }),
    );
    await expect(writeConfig(path, config)).rejects.toMatchObject({
      kind: 'config',
    });
    expect(await fs.readFile(path, 'utf8')).toBe(before);
    expect(await fs.readdir(directory)).toEqual(['config.json']);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

/** Reserved object-property names must act as ordinary own profile keys. */
it('round-trips prototype-like profile names without changing object prototypes', async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'noticeboard-keys-'));
  const path = join(directory, 'config.json');
  try {
    const config = await readConfig(path);
    config.profiles.__proto__ = {
      baseUrl: 'https://example.test',
      demoUserId: 'user-1',
    };
    config.currentProfile = '__proto__';
    await writeConfig(path, config);
    const restored = await readConfig(path);
    expect(Object.keys(restored.profiles)).toEqual(['local', '__proto__']);
    expect(restored.profiles.__proto__).toEqual({
      baseUrl: 'https://example.test',
      demoUserId: 'user-1',
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
