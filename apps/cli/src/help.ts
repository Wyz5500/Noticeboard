/** Renders bundled Chinese help and manuals without configuration, filesystem or HTTP access. */
import {
  COMMANDS,
  PUBLIC_OPTIONS,
  type CommandDefinition,
} from './command-catalog.js';

const OPTION_HELP: Record<string, string> = {
  profile:
    '--profile <name>：本次使用的连接配置；默认按环境变量和当前 profile 选择。',
  'base-url':
    '--base-url <url>：本次 HTTP(S) 服务地址，可带路径前缀；禁止凭据、查询和 fragment。profile set 用它保存地址。',
  user: '--user <user-id>：本次 demo 身份 ID；profile set 用它保存身份。不是正式认证。',
  json: '--json：输出 JSON；成功到 stdout，错误到 stderr。默认输出中文文本。',
  help: '--help, -h：显示当前命令帮助；无需业务必填参数，不读取配置或访问网络。',
  name: '--name <text>：用户显示姓名或角色名称，必须为非空文本。',
  'role-id': '--role-id <id>：分配的角色 ID，通过 role list 查询。',
  permissions:
    '--permissions <code,code>：逗号分隔的完整权限集合，不能重复或包含空项。可选 system.manage、tasks.view、tasks.create、tasks.accept、tasks.complete、tasks.review、tasks.close、demo.reset。',
  'clear-permissions':
    '--clear-permissions：显式清空角色全部权限，与 --permissions 互斥。',
  mine: '--mine：仅保留归属于当前身份的任务；额外请求身份列表，按最后有效生命周期操作人判断，评论不改变归属。默认不筛选。',
  status:
    '--status <status>：按有效状态筛选；可选 not_started、in_progress、completed、reopened、closed、expired。默认全部状态。',
  search:
    '--search <text>：去除首尾空白后按中文区域规则忽略大小写做包含匹配；默认不筛选。',
  active: '--active true|false|all：筛选有效状态，默认 all。',
  deleted: '--deleted true|false|all：筛选是否逻辑删除，默认 all。',
  yes: '--yes：显式跳过确认；默认普通 TTY 提示确认，非 TTY 或 JSON 必须提供 --yes。只有 y / yes 同意；拒绝、EOF 或中断退出 64。',
  title: '--title <text>：必填，任务标题。',
  type: '--type <type>：必填，类型为 exploration、collection、escort、bounty、building。',
  reward: '--reward <text>：必填，非空奖励说明。',
  'due-date':
    '--due-date <yyyy-mm-dd>：必填，截止日期；日历有效性和业务日期约束由服务器判定。',
  description:
    '--description <text>：直接提供非空任务描述，与 --description-file 二选一。',
  'description-file':
    '--description-file <path|->：读取 UTF-8 任务描述；- 表示 stdin，与 --description 二选一。',
  content: '--content <text>：直接提供非空评论正文，与 --content-file 二选一。',
  'content-file':
    '--content-file <path|->：读取 UTF-8 评论正文；- 表示 stdin，与 --content 二选一。',
  'expected-version':
    '--expected-version <number>：正安全整数；省略时只预读一次任务版本。409 后不刷新重放，返回 75；结果不确定时重新读取服务器状态。',
  'recovery-strategy':
    '--recovery-strategy <strategy>：必填；preserve_status 保留状态，reopened 恢复为重新开启状态，具体适用条件由服务器判定。',
};

const PUBLIC_HELP = PUBLIC_OPTIONS.map(
  (option) => `  ${OPTION_HELP[option]}`,
).join('\n');
const OVERVIEW_NOTES =
  '写操作不重试；任务与评论省略版本时只预读一次。\ndemo reset 替换全部任务及时间线，保留用户和角色；非 TTY 或 JSON 必须提供 --yes。\nHTTP 客户端；身份为 demo-only。';

const GUIDE = `快速开始
  需要 Node 24.x；CLI 是远程 HTTP 客户端。
  将下面的 PORT 替换为宿主机应用实际分配的端口：
  noticeboard profile set dev --base-url http://127.0.0.1:PORT
  noticeboard profile use dev
  noticeboard identity list
  noticeboard identity use noticeboard-master
  noticeboard task list --json
  noticeboard task get task-id
  noticeboard man task create
  示例中的 task-id、comment-id、role-id 和 user-id 应替换为服务器返回的真实 ID。

配置与环境变量
  NOTICEBOARD_CONFIG_FILE：配置文件绝对路径覆盖。
  Linux：$XDG_CONFIG_HOME/noticeboard/config.json，缺省 ~/.config/noticeboard/config.json。
  macOS：~/Library/Application Support/noticeboard/config.json。
  Windows：%APPDATA%/noticeboard/config.json；APPDATA 必须为绝对路径。
  profile 选择：--profile > NOTICEBOARD_PROFILE > currentProfile。
  服务地址：--base-url > NOTICEBOARD_BASE_URL > 所选 profile.baseUrl。
  演示身份：--user > NOTICEBOARD_USER > 所选 profile.demoUserId。
  无配置时使用内存 local：http://127.0.0.1:3000、noticeboard-master；读取不落盘。
  开发应显式配置动态端口。环境变量和请求覆盖不写入配置。
  profile set/use/delete 与 identity use 显式原子写入配置。
  禁止删除当前激活 profile；先 profile use 切换，不隐式切换。
  仅保存服务地址与 demo 身份，不保存任务、缓存或秘密。

身份与权限
  X-Demo-User-Id 仅选择演示身份，不是正式认证。
  管理命令要求 system.manage；可显式 --user noticeboard-admin，不自动切换管理员。
  demo reset 要求 demo.reset。任务与评论权限和状态约束由服务器判断。

正文、并发与确认
  --description/--description-file、--content/--content-file 各自必须二选一。
  文件为 UTF-8，- 表示 stdin；保留多行，空白正文和 NUL 不被接受。
  示例：noticeboard comment create task-id --content-file -
  任务动作、续期与评论写入省略 --expected-version 时仅预读一次；显式版本直接提交。
  409 退出 75，不刷新并重放；所有写请求不自动重试。
  创建任务、管理写入及 demo reset 无版本参数且不预读。
  删除 profile/评论/用户/角色和 demo reset：非 TTY 或 JSON 必须 --yes。
  普通 TTY 仅 y / yes 确认；取消、EOF 或中断退出 64。reset 确认会展示目标服务。
  HTTP 请求使用 30 秒取消窗口；写入结果不确定时用对应 list/get 核对再决定是否重试。

JSON 与输出
  成功 stdout：{"data":...}；失败 stderr：{"error":{"kind":"usage","message":"..."},"meta":{"exitCode":64}}。
  帮助：{"data":{"help":"..."}}；手册：{"data":{"manual":"..."}}。
  任务/评论版本化写入带 meta.expectedVersion，data.version 是结果版本；任务创建无 meta。
  管理删除返回 {"data":{"ok":true,"id":"..."}}，其他管理写入无 meta；reset 返回 {"data":{"ok":true}}。
  人类输出会转义终端控制字符；管道和自动化建议 --json。

退出码与常见错误
  0 成功；1 内部或未分类错误；64 参数、输入或配置无效；65 HTTP 协议/JSON 无效；66 资源不存在。
  69 网络、超时或服务器不可用；75 冲突或限流；77 身份无效或权限不足。
  HTTP 400→64、401/403→77、404→66、409/429→75、5xx→69；协议错误优先，例如 HTML 503→65。
  64：使用对应 --help，检查必填项、互斥项、绝对配置路径；未知或重复参数不被接受。
  65：检查服务地址与 API 版本；保留错误信息以排查非法响应。
  66：使用对应 list 查询有效 ID。77：identity list / identity use，核对服务器授予的权限。
  69/75：先查询服务器实际状态；不要自动重放结果不确定的写入。
  脚本同时检查退出码和 error.code；未知服务器错误码原样保留。

阅读方式
  noticeboard --help：索引；noticeboard task --help：资源索引；noticeboard task create --help：具体用法。
  noticeboard man：完整手册；noticeboard man task：资源手册；noticeboard man task create：命令手册。
  帮助和手册完全离线，直接输出纯文本，不调用系统 man 或分页器。
`;

/** Renders one command with only its own grammar, constraints and options. */
function commandHelp(name: string, command: CommandDefinition): string {
  const management = /^(admin|user|role|permission) /.test(name)
    ? '\n管理命令要求 system.manage；显式 --user noticeboard-admin 可选择演示管理员。管理写入不预读、不重试，无版本参数。'
    : '';
  return `用法：noticeboard ${command.usage}\n用途：${command.summary}\n\n参数：\n${command.details}\n${(command.options ?? []).map((option) => `  ${OPTION_HELP[option]}`).join('\n')}\n\n公共选项：\n${PUBLIC_HELP}${management}\n\n示例：\n  noticeboard ${command.example}\n`;
}

/** Selects exact command help or a resource/root index without executing the selected command. */
export function helpText(name: string): string {
  if (Object.hasOwn(COMMANDS, name)) return commandHelp(name, COMMANDS[name]!);
  const entries = Object.entries(COMMANDS).filter(
    ([key]) => !name || key.startsWith(`${name} `),
  );
  return `用法：noticeboard ${name ? `${name} <命令>` : '<资源> <命令>'} [选项]\n\n${entries.map(([, command]) => `  noticeboard ${command.usage}\n    ${command.summary}`).join('\n')}\n\n公共选项：\n${PUBLIC_HELP}\n\n${OVERVIEW_NOTES}\n使用 noticeboard man${name ? ` ${name}` : ''} 阅读详细手册。\n`;
}

/** Builds manuals from the same command definitions bundled with the parser. */
export function manualText(topic: string): string {
  if (Object.hasOwn(COMMANDS, topic))
    return commandHelp(topic, COMMANDS[topic]!);
  const entries = Object.entries(COMMANDS).filter(
    ([name]) => !topic || name.startsWith(`${topic} `),
  );
  return `Noticeboard 中文使用手册${topic ? `：${topic}` : ''}\n\n${topic ? '' : `${GUIDE}\n`}\n${entries.map(([name, command]) => commandHelp(name, command)).join('\n')}`;
}
