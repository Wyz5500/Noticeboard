/** Independent management wire fixtures include ordered active and deleted records. */
export const adminOverview = {
  users: [
    {
      id: 'user-z',
      username: 'user-z',
      name: '管理员',
      roleId: 'role-z',
      roleCode: 'admin',
      roleName: '管理角色',
      active: true,
      deletedAt: null,
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    {
      id: 'user-a',
      username: 'user-a',
      name: '已删除用户',
      roleId: 'role-a',
      roleCode: 'custom',
      roleName: '自定义角色',
      active: false,
      deletedAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    },
  ],
  roles: [
    {
      id: 'role-z',
      code: 'admin',
      name: '管理角色',
      builtin: true,
      permissions: ['system.manage', 'tasks.view'],
      active: true,
      deletedAt: null,
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    {
      id: 'role-a',
      code: 'custom',
      name: '自定义角色',
      builtin: false,
      permissions: [],
      active: false,
      deletedAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    },
  ],
  permissions: [
    { code: 'system.manage', name: '系统管理', description: '管理用户与角色' },
    { code: 'tasks.view', name: '查看任务', description: '读取任务' },
  ],
};
