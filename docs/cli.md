# CLI 当前能力与目标合同

> **实施状态：只读 CLI 已实现。** 当前支持 profile、demo identity、`task list/get`、JSON 信封与稳定退出码，并提供可本地打包安装的私有 CLI。SDK 写操作、任务与评论写命令、registry 发布和 TUI 仍为目标状态。

CLI 只消费手写 SDK 公共入口的 `tasks.list/get` 与 `identities.list`，使用合同见 [`sdk.md`](sdk.md)。`npm run cli:build` 生成 `dist/cli`，`npm run test:cli` 验证命令和本地安装包；真实宿主机 HTTP smoke 随完整 verify 运行。

## 定位与边界

CLI 是告示牌的主要目标交互入口，也是远程 HTTP 客户端。它只能通过手写 SDK 调用 `/api/v1`，不得直接访问 PostgreSQL、migration、Nest Module、服务器 Application/Domain、Feature `public/` 或 generated transport。

第一阶段：

- 仅以内部或私有 npm 包交付，包名在发布前另行确认。
- 可执行文件为 `noticeboard`；本地占位包名为 `noticeboard-cli-local`、版本为 `0.0.0`，标记 `private: true`，不代表 registry 发布版本。
- SDK bundle 在 CLI 包内，不单独发布。
- 支持 Node.js 24.x。
- 当前覆盖 profile、demo identity、任务读取；任务和评论写入为下一阶段目标。用户、角色、权限、demo reset 与 TUI 不属于首发范围。

CLI 默认服务人工终端使用，同时必须提供稳定、无交互的脚本接口。

## 当前命令树

```text
noticeboard profile list
noticeboard profile show [name]
noticeboard profile set <name> --base-url <url> [--user <user-id>]
noticeboard profile use <name>
noticeboard profile delete <name> [--yes]

noticeboard identity list
noticeboard identity current
noticeboard identity use <user-id>

noticeboard task list [--mine] [--status <status>] [--search <text>]
noticeboard task get <task-id>
```

### 后续写命令（尚未实现）

```text
noticeboard task create --title <text> --type <type> --reward <text> \
  --due-date <yyyy-mm-dd> (--description <text> | --description-file <path|->)
noticeboard task act <task-id> <action> [--expected-version <number>]
noticeboard task renew <task-id> --due-date <yyyy-mm-dd> \
  --recovery-strategy <strategy> [--expected-version <number>]

noticeboard comment create <task-id> \
  (--content <text> | --content-file <path|->) \
  [--expected-version <number>]
noticeboard comment edit <task-id> <comment-id> \
  (--content <text> | --content-file <path|->) \
  [--expected-version <number>]
noticeboard comment delete <task-id> <comment-id> \
  [--expected-version <number>] [--yes]
```

当前命令共同支持：

```text
--profile <name>
--base-url <url>
--user <user-id>
--json
--help
```

`--profile`、`--base-url` 和 `--user` 只覆盖当前命令，不隐式改写配置。`identity use` 与 `profile use/set/delete` 是修改配置的显式入口。

参数允许出现在命令前后。未知命令、未知选项、重复单值参数、缺少参数与多余位置参数返回 64。`--help` 不读取配置或发起请求；与 `--json` 同用时返回 `{ "data": { "help": "..." } }`。

后续任务写动作使用 API v1 机器枚举：

- `accept`
- `complete`
- `approve`
- `reopen`
- `close`

续期策略使用：

- `preserve_status`
- `reopened`

状态筛选使用 API 机器状态，不使用 Web hash 路由中的中文词汇。CLI 可在人类输出中显示中文标签，但 JSON 和参数保持稳定机器值。

## 任务列表的客户端读取语义

API v1 当前一次返回完整任务数组，不提供分页、mine、状态或搜索查询参数。首版 `task list` 在 CLI 侧完成：

- `--mine`：沿用现有产品语义，根据时间线中最后一位仍有效的任务生命周期操作人判断；评论创建、编辑和删除不改变任务归属。
- `--status`：按服务器返回的有效状态过滤。
- `--search`：搜索标题、类型标签、描述、发布者姓名、接取者姓名，按空格连接后执行包含匹配；搜索词去除首尾空白，双方使用 `toLocaleLowerCase('zh-CN')`，不搜索评论或奖励。

三个筛选条件按 AND 组合，保留服务器任务顺序，空结果返回成功空数组。`--mine` 额外通过 SDK 读取有效身份列表，任一请求失败即整条命令失败。

这些选项不得被编码为不存在的 HTTP 查询参数，也不得改变 `/api/v1/tasks` 的响应形状。未来若服务端增加兼容查询能力，CLI public 行为仍须按本文和自身 SemVer 治理。

## Profile 与配置

### 存储位置

配置使用平台标准配置目录：

- Linux：`$XDG_CONFIG_HOME/noticeboard/config.json`，缺省为 `~/.config/noticeboard/config.json`。
- macOS：`~/Library/Application Support/noticeboard/config.json`。
- Windows：`%APPDATA%/noticeboard/config.json`，APPDATA 必须为绝对路径。
- `NOTICEBOARD_CONFIG_FILE` 可覆盖配置文件的绝对路径；相对路径及相对 XDG 根目录报配置错误。

不得把配置写入仓库、当前工作目录或浏览器存储。配置文件写入必须采用同目录临时文件加原子替换，并限制为当前用户可读写。

### 配置 schema

当前配置为版本化 JSON：

```json
{
  "version": 1,
  "currentProfile": "local",
  "profiles": {
    "local": {
      "baseUrl": "http://127.0.0.1:3000",
      "demoUserId": "noticeboard-master"
    }
  }
}
```

第一阶段只保存：

- schema version；
- 当前 profile 名；
- profile 的 API base URL；
- profile 的当前 demo user ID。

不得保存任务、评论、响应缓存、密码、token 或其他秘密。配置版本不受支持、JSON 损坏、字段类型错误或当前 profile 不存在时，CLI 必须明确报配置错误，不能静默丢弃或覆盖用户配置。

`currentProfile` 必须始终指向 `profiles` 中的现存条目。`profile delete <name>` 在 `<name>` 是当前激活 profile 时必须拒绝并返回配置错误（退出码 64）；用户必须先通过 `profile use <other-name>` 显式切换到另一个 profile，再执行删除。删除命令不得隐式选择 fallback，也不得清空 `currentProfile`。`profile set`、`profile use` 和 `profile delete` 的全部配置变更都必须在一次原子替换中维持该不变量，不能留下部分写入或悬空引用。

配置文件不存在时，只在内存中提供上述 `local` 默认值；首次显式配置修改才落盘。POSIX 文件权限为 0600，新建目录权限为 0700；同目录临时文件写入、同步并关闭后执行原子替换。未知字段拒绝读取，不静默丢弃。并行配置写入采用最后成功替换的快照，不提供跨进程更新合并。

`profile set` 创建或更新指定条目，不切换激活项；省略 `--user` 时保留已有身份，新条目采用 `noticeboard-master`。所有修改只持久化显式输入，不把环境覆盖写回。`profile show [name]` 显示保存值，不展示请求覆盖值；显式 name 优先于 profile 选择器。`profile use/set/delete` 以位置参数为修改目标。

`identity current` 读取有效身份列表并返回实际请求身份；找不到返回 77。`identity use` 先验证位置参数指定的目标身份，成功后仅修改当前激活 profile；profile 参数或环境变量指向其他条目时返回 64，提示先 `profile use` 切换。失败不写入配置。

### 解析优先级

```text
命令参数
  > NOTICEBOARD_* 环境变量
    > 当前或 --profile 指定的 profile
      > 本地 demo 默认值
```

当前环境变量：

- `NOTICEBOARD_CONFIG_FILE`
- `NOTICEBOARD_PROFILE`
- `NOTICEBOARD_BASE_URL`
- `NOTICEBOARD_USER`

`--user` 与 `NOTICEBOARD_USER` 只覆盖请求身份，不写回 profile。没有有效身份的受保护命令必须失败，并提示使用 `identity list` 和 `identity use`；CLI 不应自行选择首个活跃用户。

来自参数、环境变量和保存配置的有效请求身份统一通过 `Headers` 规范化；例如 `user-1` 在请求头、`identity current` 和 `task list --mine` 中均按 `user-1` 使用。读取时不改写保存的身份值；空白身份和控制字符仍按本地输入规则拒绝。

## Demo 身份与未来认证

当前 API 使用 `X-Demo-User-Id`，它只是身份选择，不是正式认证。SDK 负责把 CLI 解析出的 demo user ID 注入请求，服务器仍是身份与权限的权威判断者。

未来正式认证只沿现有 SDK 认证注入边界扩展：

- CLI 配置可以保存 credential reference，但不直接保存秘密。
- 密码、token 或 refresh credential 应交给系统安全存储或专用凭据提供者。
- 本文不提前决定 JWT、session、OAuth、device flow、token 生命周期或登录协议。
- 正式认证到来后，demo `--user` 只可在明确的 demo profile 中继续存在，不能伪装成生产认证。

## 输入与交互原则

当前 `profile delete` 在非 TTY 或 `--json` 模式下必须提供 `--yes`。普通 TTY 仅输入 `y` 或 `yes` 才执行；拒绝、EOF 或中断均不修改配置并返回 64。以下文件/stdin 输入规则适用于尚未实现的写命令。

所有操作都必须能通过参数、文件或 stdin 非交互完成。`--description-file -` 与 `--content-file -` 表示从 stdin 读取；同一字段的直接参数和文件参数互斥。

CLI 不提供默认交互向导。缺少必填输入时返回 usage 错误，不在自动化环境中逐项询问。

危险操作只允许以下行为：

- TTY：默认请求确认，可用 `--yes` 明确跳过。
- 非 TTY：必须显式传入 `--yes`；缺少时拒绝执行。

首版至少把评论删除和 profile 删除视为危险操作。不能因为 stdin 不可交互而默认执行。

## 乐观并发与重试

当前只读命令不重试；远端命令共用一个 30 秒请求窗口，超时取消通过 SDK 映射为 network/69。以下乐观并发规则属于后续写操作目标。

任务生命周期、续期和评论写入必须使用任务 `version`：

1. 提供 `--expected-version` 时，CLI 直接用该版本提交。
2. 未提供时，CLI 先执行一次任务详情读取，并使用读取到的最新版本提交。
3. 服务端返回 409 时，CLI 不自动再次读取并重放操作；应显示服务器 `error.code`、本次使用的版本和重新 `task get` 的建议，并以退出码 75 结束。

SDK 和 CLI 均不得默认重试非幂等写操作。网络在提交后断开时，客户端无法确定服务器是否已提交；此时应报告结果不确定并要求用户重新读取状态，不能自动重复评论或任务动作。

只读请求未来可以在明确、可观测且不改变 public 行为的策略下增加有限重试，但不属于首版默认合同。

## 输出合同

### stdout 与 stderr

- stdout：成功结果。
- stderr：错误、警告和诊断。
- 默认不输出请求调试日志、banner 或遥测信息。
- stdout 被 pipe 或重定向时，不自动切换为 JSON；机器调用必须显式传 `--json`。
- 当前不启用颜色；人类输出转义用户内容中的终端控制字符。未来颜色只在 TTY 中启用，并尊重 `NO_COLOR`。

进程边界显式处理输出流错误：下游提前关闭 stdout 导致的 `EPIPE` 安静结束并返回 0，不打印错误或 Node 堆栈；此时下游主动放弃了完整结果。其他 stdout 写入错误返回 1，并尽可能按当前文本/JSON 模式写入 stderr。stderr 本身不可写时返回 1，不递归输出诊断。

### 人类格式

默认输出中文友好文本或表格。任务列表至少稳定表达 ID、标题、状态、接取者、截止日期和版本；终端宽度可影响排版，但不得隐藏后续写操作所需的任务 ID 与版本语义。

人类格式不承诺空格或列宽逐字符兼容，但命令含义、字段含义和成功/失败行为属于 CLI public contract。

### JSON 成功信封

`--json` 时 stdout 只输出一个有效 JSON 值：

```json
{
  "data": {},
  "meta": {}
}
```

- `data` 必须存在，可以是对象、数组、标量或 `null`。
- `meta` 可选，用于筛选条件、数量、使用的 expected version、profile 等非资源元数据。
- 不能在 JSON 前后混入进度、提示或人类文案。
- 无响应正文的成功操作仍输出明确结果，例如 `{ "data": { "ok": true } }`。

当前读取 JSON 的 `data`：任务列表为 `Task[]`，详情为 `Task`，身份列表为 `Identity[]`，当前/切换身份为 `Identity`。profile 列表为 `{name,baseUrl,demoUserId,current}[]`，show/set/use 返回单个同形对象；删除返回 `{ok:true,name}`。当前不输出成功 meta。

### JSON 错误信封

`--json` 时 stderr 只输出一个有效 JSON 错误值：

```json
{
  "error": {
    "kind": "api",
    "code": "CONFLICT",
    "message": "服务器返回的安全错误消息",
    "details": {}
  },
  "meta": {
    "exitCode": 75
  }
}
```

`kind` 至少区分：

- `usage`
- `config`
- `api`
- `network`
- `protocol`
- `internal`

API 错误应尽量保留 status、path、timestamp 和 details，但未知字段或未知 `error.code` 不能导致 CLI 崩溃。

## 退出码

| 退出码 | 稳定语义                                     |
| -----: | -------------------------------------------- |
|      0 | 成功                                         |
|      1 | 未分类运行错误或 CLI 内部缺陷                |
|     64 | 命令语法、缺少参数、本地输入或配置无效       |
|     65 | HTTP 响应无法解析或违反预期协议              |
|     66 | 远端资源不存在                               |
|     69 | 网络不可达、超时、服务不可用或服务器暂不可用 |
|     75 | 乐观并发冲突、限流或明确可重试的临时失败     |
|     77 | 身份无效或权限不足                           |

默认映射：

- HTTP 400 → 64
- HTTP 401/403 → 77
- HTTP 404 → 66
- HTTP 409/429 → 75
- HTTP 5xx、连接失败或超时 → 69
- 非法 JSON 或契约不符合预期 → 65

协议错误分类优先于 HTTP 状态，例如 HTML 503 返回 65。其他未分类 HTTP 状态返回 1；无有效身份时提示 `identity list` / `identity use`。

退出码不能替代服务器 `error.code`；脚本应同时读取退出码和 JSON 错误信封。

## 包与版本

CLI package version 独立于 API v1、OpenAPI `info.version` 和未来 SDK version。以下变更通常需要 CLI major 或迁移窗口：

- 删除或重命名命令、参数、环境变量或配置字段。
- 改变默认 profile/身份解析优先级。
- 改变 JSON 信封或退出码语义。
- 把原本非交互命令改为必须交互。
- 在非 TTY 中弱化危险操作的 `--yes` 要求。

人类输出新增提示或调整列宽通常可以兼容演进，但不能破坏脚本明确依赖的 `--json` 合同。

服务器 `npm run release` 只表示合并并永久部署，不发布 CLI。未来 npm publish 必须使用独立命令、验证和明确授权。
