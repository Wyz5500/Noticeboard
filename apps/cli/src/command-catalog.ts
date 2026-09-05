/** Defines the CLI command grammar and offline documentation in one client-owned catalog. */
export interface CommandDefinition {
  min: number;
  max: number;
  options?: string[];
  usage: string;
  summary: string;
  details: string;
  example: string;
}

export const COMMANDS: Record<string, CommandDefinition> = {
  'demo reset': {
    min: 0,
    max: 0,
    options: ['yes'],
    usage: 'demo reset [--yes]',
    summary: '恢复演示任务和时间线',
    details:
      '替换全部任务及时间线，保留用户和角色。普通 TTY 确认目标服务，非 TTY 或 JSON 必须提供 --yes。重置无版本参数，不预读、不重试。',
    example: 'demo reset --yes --user noticeboard-admin',
  },
  'user create': {
    min: 0,
    max: 0,
    options: ['name', 'role-id'],
    usage: 'user create --name <text> --role-id <id>',
    summary: '创建用户',
    details: '--name 与 --role-id 必填。username 由服务器派生，不能指定。',
    example:
      'user create --name "小明" --role-id role-id --user noticeboard-admin',
  },
  'user update': {
    min: 1,
    max: 1,
    options: ['name', 'role-id'],
    usage: 'user update <id> [--name <text>] [--role-id <id>]',
    summary: '更新用户姓名或角色',
    details: '<id>：必填，用户 ID。--name 与 --role-id 至少提供一个字段。',
    example:
      'user update noticeboard-master --name "新姓名" --user noticeboard-admin',
  },
  'user delete': {
    min: 1,
    max: 1,
    options: ['yes'],
    usage: 'user delete <id> [--yes]',
    summary: '软删除用户',
    details: '<id>：必填，用户 ID。服务器判定管理约束；可通过 restore 恢复。',
    example: 'user delete user-id --yes --user noticeboard-admin',
  },
  'user restore': {
    min: 1,
    max: 1,
    usage: 'user restore <id>',
    summary: '恢复已删除用户',
    details: '<id>：必填，用户 ID。由服务器判定是否允许恢复。',
    example: 'user restore user-id --user noticeboard-admin',
  },
  'role create': {
    min: 0,
    max: 0,
    options: ['name', 'permissions'],
    usage: 'role create --name <text> [--permissions <code,code>]',
    summary: '创建角色',
    details: '--name 必填；省略 --permissions 时创建空权限角色。',
    example:
      'role create --name "观察员" --permissions tasks.view --user noticeboard-admin',
  },
  'role update': {
    min: 1,
    max: 1,
    options: ['name', 'permissions', 'clear-permissions'],
    usage:
      'role update <id> --name <text> (--permissions <code,code> | --clear-permissions)',
    summary: '更新角色名称及完整权限',
    details:
      '<id>：必填，角色 ID。--name 必填；--permissions 与 --clear-permissions 必须且只能提供一个。权限为完整替换。',
    example:
      'role update role-id --name "观察员" --clear-permissions --user noticeboard-admin',
  },
  'role delete': {
    min: 1,
    max: 1,
    options: ['yes'],
    usage: 'role delete <id> [--yes]',
    summary: '软删除角色',
    details: '<id>：必填，角色 ID。服务器判定管理约束；可通过 restore 恢复。',
    example: 'role delete role-id --yes --user noticeboard-admin',
  },
  'role restore': {
    min: 1,
    max: 1,
    usage: 'role restore <id>',
    summary: '恢复已删除角色',
    details: '<id>：必填，角色 ID。由服务器判定是否允许恢复。',
    example: 'role restore role-id --user noticeboard-admin',
  },
  'admin overview': {
    min: 0,
    max: 0,
    usage: 'admin overview',
    summary: '读取用户、角色和权限总览',
    details: '无位置参数。返回完整目录，包括逻辑删除记录。',
    example: 'admin overview --user noticeboard-admin --json',
  },
  'user list': {
    min: 0,
    max: 0,
    options: ['search', 'active', 'deleted'],
    usage:
      'user list [--search <text>] [--active true|false|all] [--deleted true|false|all]',
    summary: '列出并筛选用户',
    details:
      '无位置参数。搜索匹配 ID、username、姓名、角色 ID、角色代码和角色名称；筛选按 AND 组合，保留服务器顺序和逻辑删除记录。',
    example: 'user list --active true --deleted false --user noticeboard-admin',
  },
  'role list': {
    min: 0,
    max: 0,
    options: ['search', 'active', 'deleted'],
    usage:
      'role list [--search <text>] [--active true|false|all] [--deleted true|false|all]',
    summary: '列出并筛选角色',
    details:
      '无位置参数。搜索匹配 ID、角色代码、名称和权限代码；筛选按 AND 组合，保留服务器顺序和逻辑删除记录。',
    example: 'role list --search "观察员" --user noticeboard-admin',
  },
  'permission list': {
    min: 0,
    max: 0,
    options: ['search'],
    usage: 'permission list [--search <text>]',
    summary: '列出并搜索权限',
    details: '无位置参数。搜索匹配权限代码、名称和描述；保留服务器顺序。',
    example: 'permission list --search task --user noticeboard-admin',
  },
  'user get': {
    min: 1,
    max: 1,
    usage: 'user get <user-id>',
    summary: '按 ID 读取用户详情',
    details: '<user-id>：必填，精确用户 ID；不存在时退出 66。',
    example: 'user get noticeboard-admin --user noticeboard-admin',
  },
  'role get': {
    min: 1,
    max: 1,
    usage: 'role get <role-id>',
    summary: '按 ID 读取角色详情',
    details: '<role-id>：必填，精确角色 ID；不存在时退出 66。',
    example: 'role get role-id --user noticeboard-admin',
  },
  'permission get': {
    min: 1,
    max: 1,
    usage: 'permission get <permission-code>',
    summary: '按代码读取权限详情',
    details: '<permission-code>：必填，精确权限代码；不存在时退出 66。',
    example: 'permission get system.manage --user noticeboard-admin',
  },
  'profile list': {
    min: 0,
    max: 0,
    usage: 'profile list',
    summary: '列出本地连接配置',
    details:
      '无位置参数。显示各 profile 的服务地址、演示身份及是否当前激活。读取不落盘。',
    example: 'profile list',
  },
  'profile show': {
    min: 0,
    max: 1,
    usage: 'profile show [name]',
    summary: '查看指定或选中的连接配置',
    details:
      '[name]：可选 profile 名称；省略时按 --profile、NOTICEBOARD_PROFILE、currentProfile 选择。',
    example: 'profile show local',
  },
  'profile set': {
    min: 1,
    max: 1,
    usage: 'profile set <name> --base-url <url> [--user <user-id>]',
    summary: '创建或替换连接配置',
    details:
      '<name>：必填，profile 名称。--base-url 必填；--user 省略时保留该 profile 的身份，新 profile 默认为 noticeboard-master。不切换当前 profile；示例中的 PORT 请替换为宿主机应用实际分配的端口。',
    example: 'profile set dev --base-url http://127.0.0.1:PORT',
  },
  'profile use': {
    min: 1,
    max: 1,
    usage: 'profile use <name>',
    summary: '显式切换当前连接配置',
    details: '<name>：必填，已存在的 profile 名称。原子更新 currentProfile。',
    example: 'profile use dev',
  },
  'profile delete': {
    min: 1,
    max: 1,
    options: ['yes'],
    usage: 'profile delete <name> [--yes]',
    summary: '删除非激活的连接配置',
    details:
      '<name>：必填，已存在的 profile 名称。禁止删除当前激活 profile，必须先显式切换。',
    example: 'profile delete old --yes',
  },
  'identity list': {
    min: 0,
    max: 0,
    usage: 'identity list',
    summary: '列出可用演示身份',
    details: '无位置参数。通过服务器读取当前可用身份；不是正式认证。',
    example: 'identity list',
  },
  'identity current': {
    min: 0,
    max: 0,
    usage: 'identity current',
    summary: '查看选中的演示身份',
    details: '无位置参数。按请求配置选择身份，再通过服务器列表确认有效性。',
    example: 'identity current',
  },
  'identity use': {
    min: 1,
    max: 1,
    usage: 'identity use <user-id>',
    summary: '保存当前 profile 的演示身份',
    details:
      '<user-id>：必填，可用演示用户 ID。只修改当前激活 profile；其他 profile 必须先 profile use。',
    example: 'identity use noticeboard-master',
  },
  'task list': {
    min: 0,
    max: 0,
    options: ['mine', 'status', 'search'],
    usage: 'task list [--mine] [--status <status>] [--search <text>]',
    summary: '读取并筛选任务列表',
    details:
      '无位置参数。搜索匹配标题、类型标签、描述、发布者姓名和接取者姓名，不匹配评论或奖励。筛选在客户端按 AND 组合，保留服务器顺序；空结果成功返回空数组。',
    example: 'task list --status in_progress --json',
  },
  'task get': {
    min: 1,
    max: 1,
    usage: 'task get <task-id>',
    summary: '读取任务详情及时间线',
    details: '<task-id>：必填，任务 ID。输出版本与评论 ID，供后续写入使用。',
    example: 'task get task-id',
  },
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
    usage:
      'task create --title <text> --type <type> --reward <text> --due-date <yyyy-mm-dd> (--description <text> | --description-file <path|->)',
    summary: '创建任务',
    details:
      '无位置参数。--title、--type、--reward、--due-date 必填；--description 与 --description-file 必须且只能提供一个。创建不预读、无版本参数。',
    example:
      'task create --title "收集木材" --type collection --reward "金币" --due-date 2026-12-31 --description "收集十份木材"',
  },
  'task act': {
    min: 2,
    max: 2,
    options: ['expected-version'],
    usage: 'task act <task-id> <action> [--expected-version <number>]',
    summary: '执行任务生命周期动作',
    details:
      '<task-id>：必填，任务 ID。<action>：必填，可选 accept（接取）、complete（提交完成）、approve（验收通过）、reopen（退回重做）、close（关闭）；状态与权限约束由服务器判定。',
    example: 'task act task-id accept --expected-version 1',
  },
  'task renew': {
    min: 1,
    max: 1,
    options: ['due-date', 'recovery-strategy', 'expected-version'],
    usage:
      'task renew <task-id> --due-date <yyyy-mm-dd> --recovery-strategy <strategy> [--expected-version <number>]',
    summary: '续期任务',
    details:
      '<task-id>：必填，任务 ID。--due-date 与 --recovery-strategy 必填，服务器判定续期资格。',
    example:
      'task renew task-id --due-date 2026-12-31 --recovery-strategy preserve_status',
  },
  'comment create': {
    min: 1,
    max: 1,
    options: ['content', 'content-file', 'expected-version'],
    usage:
      'comment create <task-id> (--content <text> | --content-file <path|->) [--expected-version <number>]',
    summary: '发表任务评论',
    details:
      '<task-id>：必填，任务 ID。--content 与 --content-file 必须且只能提供一个。评论最多 1000 字，具体校验由服务器执行。',
    example: 'comment create task-id --content "已经开始处理"',
  },
  'comment edit': {
    min: 2,
    max: 2,
    options: ['content', 'content-file', 'expected-version'],
    usage:
      'comment edit <task-id> <comment-id> (--content <text> | --content-file <path|->) [--expected-version <number>]',
    summary: '编辑自己发表的评论',
    details:
      '<task-id>、<comment-id>：必填，任务和评论 ID。--content 与 --content-file 必须且只能提供一个。仅原作者可编辑，服务器保留修订记录。',
    example: 'comment edit task-id comment-id --content "已经完成处理"',
  },
  'comment delete': {
    min: 2,
    max: 2,
    options: ['expected-version', 'yes'],
    usage:
      'comment delete <task-id> <comment-id> [--expected-version <number>] [--yes]',
    summary: '删除评论并保留占位',
    details:
      '<task-id>、<comment-id>：必填，任务和评论 ID。作者或系统管理员可删除，公开时间线保留脱敏占位。',
    example: 'comment delete task-id comment-id --yes',
  },
  man: {
    min: 0,
    max: 2,
    usage: 'man [资源 [命令]]',
    summary: '离线阅读完整或指定主题的中文使用手册',
    details:
      '[资源]、[命令]：可选；省略时输出完整手册。也支持 man man。公共连接与身份选项不生效。直接输出纯文本，不启动分页器，不读取配置或连接服务器。',
    example: 'man task create',
  },
};

export const PUBLIC_OPTIONS = ['profile', 'base-url', 'user', 'json', 'help'];
export const RESOURCES = [
  ...new Set(
    Object.keys(COMMANDS)
      .filter((name) => name !== 'man')
      .map((name) => name.split(' ')[0]!),
  ),
];
