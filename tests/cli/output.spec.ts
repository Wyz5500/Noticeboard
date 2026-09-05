/** Guards human CLI tables against terminal column drift and unsafe remote cells. */
import { describe, expect, it } from 'vitest';
import stringWidth from 'string-width';
import { frameHumanOutput, humanResult } from '../../apps/cli/src/output.js';

describe('human table alignment', () => {
  /** Long identifiers and Chinese names must share column starts with the header. */
  it('aligns identity headers and mixed-width rows', () => {
    expect(
      humanResult('identity list', [
        {
          id: 'noticeboard-master',
          name: '用户 A',
          username: 'noticeboard-master',
          roleLabel: '用户',
        },
        {
          id: 'a',
          name: '公会管理员',
          username: 'admin',
          roleLabel: '系统管理员',
        },
      ]),
    ).toBe(
      '-------------------+----------------------------------------------\n' +
        'ID                 | 姓名         用户名                角色\n' +
        '-------------------+----------------------------------------------\n' +
        'noticeboard-master | 用户 A       @noticeboard-master   用户\n' +
        'a                  | 公会管理员   @admin                系统管理员\n' +
        '-------------------+----------------------------------------------\n',
    );
  });

  /** Every list shares width-aware padding, including escaped controls and graphemes. */
  it.each([
    [
      'permission list',
      [
        { code: 'x\ty', name: '👩‍💻', description: '开发' },
        { code: 'ok', name: 'e\u0301', description: '组合' },
      ],
      '---------+------------\nID       | 名称   描述\n---------+------------\nx\\u0009y | 👩‍💻     开发\nok       | e\u0301      组合\n---------+------------\n',
    ],
    [
      'profile list',
      [
        {
          name: 'local',
          baseUrl: 'http://127.0.0.1:3000',
          demoUserId: 'admin',
          current: true,
        },
      ],
      '------+--------------------------------------------\nID    | 服务地址                演示身份   当前激活\n------+--------------------------------------------\nlocal | http://127.0.0.1:3000   admin      是\n------+--------------------------------------------\n',
    ],
    [
      'task list',
      [
        {
          id: '1',
          title: '中文任务',
          statusLabel: '待接取',
          assignee: null,
          dueDate: '2026-09-05',
          version: 2,
        },
      ],
      '---+-----------------------------------------------\nID | 标题       状态     接取者   截止日期     版本\n---+-----------------------------------------------\n1  | 中文任务   待接取   未接取   2026-09-05   2\n---+-----------------------------------------------\n',
    ],
    [
      'user list',
      [
        {
          id: '1',
          username: 'a',
          name: '用户',
          roleId: 'r',
          roleName: '用户',
          active: true,
          deletedAt: null,
        },
      ],
      '---+-----------------------------------------------------\nID | 用户名   姓名   角色 ID   角色名称   启用   删除时间\n---+-----------------------------------------------------\n1  | @a       用户   r         用户       是     —\n---+-----------------------------------------------------\n',
    ],
    [
      'role list',
      [
        {
          id: 'r',
          code: 'member',
          name: '用户',
          builtin: true,
          permissions: ['tasks.view'],
          active: true,
          deletedAt: null,
        },
      ],
      '---+----------------------------------------------------\nID | 代码     名称   内置   权限码       启用   删除时间\n---+----------------------------------------------------\nr  | member   用户   是     tasks.view   是     —\n---+----------------------------------------------------\n',
    ],
  ])('aligns %s without terminal tabs', (command, data, expected) => {
    expect(humanResult(command, data)).toBe(expected);
    for (const columns of [120, 80, 40, 20]) {
      for (const line of humanResult(command, data, columns).split('\n')) {
        expect(stringWidth(line)).toBeLessThanOrEqual(columns);
      }
    }
  });

  /** Empty results retain their explanatory message under the aligned header. */
  it('preserves empty list output', () => {
    expect(humanResult('identity list', [])).toBe(
      '---+---------------------\nID | 姓名   用户名   角色\n---+---------------------\n无可用身份\n---+---------------------\n',
    );
  });
});

/** Every physical row must fit without relying on the terminal's automatic wrapping. */
it.each([120, 80, 40, 20])('fits mixed graphemes in %i columns', (columns) => {
  const output = humanResult(
    'permission list',
    [
      {
        code: 'identifier-123456789',
        name: '👩‍💻e\u0301中文',
        description: '描述'.repeat(30),
      },
    ],
    columns,
  );
  for (const line of output.trimEnd().split('\n')) {
    expect(stringWidth(line)).toBeLessThanOrEqual(columns);
  }
  expect(output).toContain('👩‍💻');
  expect(output).toContain('e\u0301');
});

/** Continued cells preserve column boundaries and all original field contents. */
it('wraps cells and headers into aligned continuation rows', () => {
  expect(
    humanResult(
      'permission list',
      [{ code: 'abcdefgh', name: '中文', description: '12345678' }],
      16,
    ),
  ).toBe(
    '----+-----------\n' +
      'ID  | 名    描述\n' +
      '    | 称    \n' +
      '----+-----------\n' +
      'abc | 中    1234\n' +
      'def | 文    5678\n' +
      'gh  |       \n' +
      '----+-----------\n',
  );
});

/** A table below its minimum width is replaced with an actionable, bounded notice. */
it.each([1, 2, 10])(
  'handles an impossibly narrow %i-column terminal',
  (columns) => {
    const output = humanResult('permission list', [], columns);
    expect(output.replaceAll('\n', '')).toContain('--json');
    for (const line of output.trimEnd().split('\n')) {
      expect(stringWidth(line)).toBeLessThanOrEqual(columns);
    }
  },
);

/** Existing rules and newly added outer rules share the terminal width limit. */
it('caps rules and wraps ordinary text without losing content', () => {
  const output = frameHumanOutput(
    '--------------------\nlong ordinary text\n----------+---------\n',
    8,
  );
  expect(output).toBe('--------\nlong ord\ninary te\nxt\n--------\n');
});

/** Invalid dimensions must not alter piped output or attempt invalid string allocations. */
it.each([undefined, 0, -1, NaN, Infinity, 1.5])(
  'ignores unusable width %s',
  (columns) => {
    expect(humanResult('identity list', [], columns)).toBe(
      humanResult('identity list', []),
    );
    expect(frameHumanOutput('hello\n', columns)).toBe('-----\nhello\n-----\n');
  },
);

/** Exact fit retains the original layout; one fewer column wraps without truncating fields. */
it('preserves task identifiers and versions across continuation lines', () => {
  const data = [
    {
      id: 'task-123456789',
      title: '标题',
      statusLabel: '状态',
      assignee: null,
      dueDate: '2026-09-05',
      version: 123456789,
    },
  ];
  const wide = humanResult('task list', data);
  const width = wide.split('\n')[0]!.length;
  expect(humanResult('task list', data, width)).toBe(wide);
  for (const columns of [width - 1, 40]) {
    const lines = humanResult('task list', data, columns).trimEnd().split('\n');
    const headerEnd = lines.findIndex(
      (line, index) => index > 0 && /^[-+]+$/.test(line),
    );
    const dataLines = lines.slice(headerEnd + 1, -1);
    expect(dataLines.map((line) => line.split(' | ')[0]!.trim()).join('')).toBe(
      'task-123456789',
    );
    const versionStart = stringWidth(lines[1]!.split('版本')[0]!);
    expect(
      dataLines
        .map((line) =>
          line
            .slice(line.length - Math.max(0, stringWidth(line) - versionStart))
            .trim(),
        )
        .join(''),
    ).toBe('123456789');
    for (const line of lines)
      expect(stringWidth(line)).toBeLessThanOrEqual(columns);
  }
});

/** Paragraph breaks, indentation and complete graphemes survive narrow text rendering. */
it('wraps indented prose without splitting graphemes or removing blank lines', () => {
  expect(frameHumanOutput('标题\n\n  中文👩‍💻e\u0301abcdef\n结束', 8)).toBe(
    '--------\n标题\n\n  中文👩‍💻\n  e\u0301abcde\n  f\n结束\n--------\n',
  );
});

/** Excessive indentation cannot consume all available columns or strand the wrapper. */
it('handles indentation wider than the terminal without discarding text', () => {
  const output = frameHumanOutput('      中文内容', 4);
  const body = output.trimEnd().split('\n').slice(1, -1);
  expect(body.join('')).toBe('      中文内容');
  for (const line of body) expect(stringWidth(line)).toBeLessThanOrEqual(4);
});

/** A terminal unable to display one grapheme gets a bounded notice, never a broken character. */
it('handles one-column prose with double-width characters', () => {
  const lines = frameHumanOutput('错误：中文', 1).trimEnd().split('\n');
  expect(lines.slice(1, -1).join('')).toContain('--json');
  for (const line of lines) expect(stringWidth(line)).toBeLessThanOrEqual(1);
});
