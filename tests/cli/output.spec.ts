/** Guards human CLI tables against terminal column drift and unsafe remote cells. */
import { describe, expect, it } from 'vitest';
import { humanResult } from '../../apps/cli/src/output.js';

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
  });

  /** Empty results retain their explanatory message under the aligned header. */
  it('preserves empty list output', () => {
    expect(humanResult('identity list', [])).toBe(
      '---+---------------------\nID | 姓名   用户名   角色\n---+---------------------\n无可用身份\n---+---------------------\n',
    );
  });
});
