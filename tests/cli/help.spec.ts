/** Verifies offline command documentation through the public CLI dispatcher. */
import { expect, it } from 'vitest';
import { COMMANDS } from '../../apps/cli/src/command-catalog.js';
import { runCli } from '../../apps/cli/src/run.js';

const commands = [
  'demo reset',
  'user create',
  'user update',
  'user delete',
  'user restore',
  'role create',
  'role update',
  'role delete',
  'role restore',
  'admin overview',
  'user list',
  'user get',
  'role list',
  'role get',
  'permission list',
  'permission get',
  'profile list',
  'profile show',
  'profile set',
  'profile use',
  'profile delete',
  'identity list',
  'identity current',
  'identity use',
  'task list',
  'task get',
  'task create',
  'task act',
  'task renew',
  'comment create',
  'comment edit',
  'comment delete',
  'man',
];

/** Makes any attempt to consume configuration, network, stdin or confirmation observable. */
async function invoke(args: string[]) {
  let stdout = '';
  let stderr = '';
  const exitCode = await runCli(args, {
    env: { NOTICEBOARD_CONFIG_FILE: 'invalid-relative-config' },
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    isTTY: false,
    fetch: async () => {
      throw new Error('unexpected network');
    },
    confirm: async () => {
      throw new Error('unexpected confirmation');
    },
    readStdin: async () => {
      throw new Error('unexpected stdin');
    },
  });
  return { stdout, stderr, exitCode };
}

/** Every executable command must explain itself without requiring its business inputs. */
it.each(commands)('documents %s with long and short help', async (command) => {
  for (const flag of ['--help', '-h']) {
    const result = await invoke([...command.split(' '), flag]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain(`用法：noticeboard ${command}`);
    expect(result.stdout).toContain('用途：');
    expect(result.stdout).toContain('参数：');
    expect(result.stdout).toContain('示例：');
    expect(result.stderr).toBe('');
  }
});

/** Leaf help must not silently fall back to the whole resource index. */
it('scopes help and keeps its JSON envelope', async () => {
  const result = await invoke(['--json', 'task', 'create', '--help']);
  const help = JSON.parse(result.stdout).data.help;
  expect(help).toContain('--description-file');
  expect(help).toContain('必填');
  expect(help).not.toContain('noticeboard task renew');
  expect((await invoke(['task', '-h'])).stdout).toContain(
    'noticeboard task renew',
  );
});

/** Manuals must be shipped offline at full, resource and command granularity. */
it.each([
  [[], '快速开始', 'noticeboard role update'],
  [['task'], 'noticeboard task create', 'noticeboard task renew'],
  [['task', 'create'], '用途：', '--description-file'],
  [['man'], '用途：', 'noticeboard man task create'],
])('reads manual topic %j', async (topic, first, second) => {
  const result = await invoke(['man', ...topic, '--json']);
  expect(result.exitCode, result.stderr).toBe(0);
  const data = (JSON.parse(result.stdout) as { data: { manual: string } }).data;
  expect(Object.keys(data)).toEqual(['manual']);
  expect(data.manual).toContain(first);
  expect(data.manual).toContain(second);
  expect(result.stderr).toBe('');
});

/** Documentation routing must preserve strict parsing rather than swallowing bad syntax. */
it.each([
  ['man', 'unknown'],
  ['man', ''],
  ['man', 'task', 'unknown'],
  ['man', 'task', 'get', 'extra'],
  ['man', '--mine'],
  ['man', '--help', '--help'],
  ['task', 'get', '--mine', '--help'],
  ['unknown', '--help'],
  ['task', 'get', '--unknown', '--help'],
])('rejects invalid documentation syntax %j', async (...args) => {
  const result = await invoke([...args, '--json']);
  expect(result.exitCode).toBe(64);
  expect(result.stdout).toBe('');
  expect(JSON.parse(result.stderr).error.kind).toBe('usage');
});

/** Help must not open supplied body files, consume stdin, or execute destructive commands. */
it.each([
  ['task', 'create', '--description-file', '/does-not-exist'],
  ['comment', 'create', '--content-file', '-'],
  ['demo', 'reset'],
  ['profile', 'delete'],
])('ignores business side effects for %j help', async (...args) => {
  expect((await invoke([...args, '--help'])).exitCode).toBe(0);
});

/** Ensures newly registered commands cannot ship without independently enumerated help coverage. */
it('covers the entire executable command catalog', () => {
  expect(Object.keys(COMMANDS).sort()).toEqual([...commands].sort());
});

/** Keeps each accepted command option discoverable and explained in leaf help. */
it.each(Object.entries(COMMANDS))(
  'explains all accepted options for %s',
  async (name, definition) => {
    const result = await invoke([...name.split(' '), '--help']);
    for (const option of definition.options ?? []) {
      expect(result.stdout).toMatch(new RegExp(`--${option}[^\\n]*：[^\\n]+`));
    }
    expect(result.stdout).not.toContain('undefined');
  },
);
