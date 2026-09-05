# CLI 目标合同

> **实施状态：尚未实现。** 本文定义首版 CLI 的目标公共合同，用于后续设计、实现和兼容审查。当前仓库没有 `noticeboard` 可执行文件、CLI npm 包或下述命令；现有可运行入口见根 `README.md`。

只读 HTTP SDK 已提供 `tasks.list/get` 与 `identities.list`，可独立构建和测试，使用合同见 [`sdk.md`](sdk.md)。下一阶段将以该公共入口实现只读 CLI；SDK 写操作、CLI profile、命令、JSON 信封和退出码仍未实现。

## 定位与边界

CLI 是告示牌的主要目标交互入口，也是远程 HTTP 客户端。它只能通过手写 SDK 调用 `/api/v1`，不得直接访问 PostgreSQL、migration、Nest Module、服务器 Application/Domain、Feature `public/` 或 generated transport。

第一阶段：

- 仅以内部或私有 npm 包交付，包名在发布前另行确认。
- 可执行文件暂定为 `noticeboard`。
- SDK bundle 在 CLI 包内，不单独发布。
- 支持 Node.js 24.x。
- 覆盖 profile、demo identity、任务和评论；用户、角色、权限、demo reset 与 TUI 不属于首发范围。

CLI 默认服务人工终端使用，同时必须提供稳定、无交互的脚本接口。

## 目标命令树

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

所有命令共同支持：

```text
--profile <name>
--base-url <url>
--user <user-id>
--json
--help
```

`--profile`、`--base-url` 和 `--user` 只覆盖当前命令，不隐式改写配置。`identity use` 与 `profile use/set/delete` 是修改配置的显式入口。

任务动作使用 API v1 机器枚举：

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
- `--search`：对任务资源的稳定展示字段执行客户端包含匹配；实现时必须用测试固定具体字段与大小写规则。

这些选项不得被编码为不存在的 HTTP 查询参数，也不得改变 `/api/v1/tasks` 的响应形状。未来若服务端增加兼容查询能力，CLI public 行为仍须按本文和自身 SemVer 治理。

## Profile 与配置

### 存储位置

配置使用平台标准配置目录：

- Linux：遵循 XDG config 目录。
- macOS 与 Windows：使用对应平台的用户应用配置目录。
- `NOTICEBOARD_CONFIG_FILE` 可显式覆盖完整配置文件路径，供测试、自动化和隔离环境使用。

不得把配置写入仓库、当前工作目录或浏览器存储。配置文件写入必须采用同目录临时文件加原子替换，并限制为当前用户可读写。

### 配置 schema

目标配置为版本化 JSON：

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

### 解析优先级

```text
命令参数
  > NOTICEBOARD_* 环境变量
    > 当前或 --profile 指定的 profile
      > 本地 demo 默认值
```

目标环境变量：

- `NOTICEBOARD_CONFIG_FILE`
- `NOTICEBOARD_PROFILE`
- `NOTICEBOARD_BASE_URL`
- `NOTICEBOARD_USER`

`--user` 与 `NOTICEBOARD_USER` 只覆盖请求身份，不写回 profile。没有有效身份的受保护命令必须失败，并提示使用 `identity list` 和 `identity use`；CLI 不应自行选择首个活跃用户。

## Demo 身份与未来认证

当前 API 使用 `X-Demo-User-Id`，它只是身份选择，不是正式认证。SDK 负责把 CLI 解析出的 demo user ID 注入请求，服务器仍是身份与权限的权威判断者。

未来正式认证只沿现有 SDK 认证注入边界扩展：

- CLI 配置可以保存 credential reference，但不直接保存秘密。
- 密码、token 或 refresh credential 应交给系统安全存储或专用凭据提供者。
- 本文不提前决定 JWT、session、OAuth、device flow、token 生命周期或登录协议。
- 正式认证到来后，demo `--user` 只可在明确的 demo profile 中继续存在，不能伪装成生产认证。

## 输入与交互原则

所有操作都必须能通过参数、文件或 stdin 非交互完成。`--description-file -` 与 `--content-file -` 表示从 stdin 读取；同一字段的直接参数和文件参数互斥。

CLI 不提供默认交互向导。缺少必填输入时返回 usage 错误，不在自动化环境中逐项询问。

危险操作只允许以下行为：

- TTY：默认请求确认，可用 `--yes` 明确跳过。
- 非 TTY：必须显式传入 `--yes`；缺少时拒绝执行。

首版至少把评论删除和 profile 删除视为危险操作。不能因为 stdin 不可交互而默认执行。

## 乐观并发与重试

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
- 颜色只在 TTY 中启用，并尊重 `NO_COLOR`。

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
