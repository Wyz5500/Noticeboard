# CLI 当前能力与目标合同

> **实施状态：任务、评论及管理资源读写 CLI 已实现。** 当前支持 profile、demo identity、任务读取、创建、生命周期、续期、评论增改删和管理总览、三类列表筛选与详情、用户和角色写入，保留 JSON 信封与稳定退出码，并提供可本地打包安装的私有 CLI。registry 发布尚未实现，TUI 暂缓；近期开发重心为 CLI，服务端保持与未来 TUI 共用的版本化 HTTP 合同。

CLI 只消费手写 SDK 公共入口的 `tasks`、`comments`、`identities`、`admin` 与 `demo`，使用合同见 [`sdk.md`](sdk.md)。`npm run cli:build` 生成 `dist/cli`，`npm run test:cli` 验证命令和本地安装包；真实宿主机 HTTP smoke 随完整 verify 运行。

## 定位与边界

CLI 是告示牌的主要目标交互入口，也是远程 HTTP 客户端。它只能通过手写 SDK 调用 `/api/v1`，不得直接访问 PostgreSQL、migration、Nest Module、服务器 Application/Domain、Feature `public/` 或 generated transport。

当前交付：

- 仅以内部或私有 npm 包交付，包名在发布前另行确认。
- 可执行文件为 `noticeboard`；本地占位包名为 `noticeboard-cli-local`、版本为 `0.0.0`，标记 `private: true`，不代表 registry 发布版本。
- SDK 继续 bundle 在 CLI 包内，同时提供独立本地 SDK tarball；两者均未发布 registry。
- 支持 Node.js 24.x。
- 当前覆盖 profile、demo identity、任务读取及任务和评论写入，以及管理总览、用户、角色和权限的列表筛选与详情。用户与角色创建、更新、软删除、恢复及 demo reset 已实现；TUI 尚未实现。

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

noticeboard demo reset [--yes]

noticeboard admin overview
noticeboard user list [--search <text>] [--active true|false|all] [--deleted true|false|all]
noticeboard user get <user-id>
noticeboard role list [--search <text>] [--active true|false|all] [--deleted true|false|all]
noticeboard role get <role-id>
noticeboard permission list [--search <text>]
noticeboard permission get <permission-code>
```

### 演示任务重置

`noticeboard demo reset [--yes]` 只调用 SDK public `demo.reset`，使用既有 `POST /api/v1/demo/reset`。支持公共 profile、base URL、身份、JSON 与 help 参数，无位置参数和 expectedVersion。普通 TTY 确认时展示经过终端安全转义的有效服务地址，并说明替换全部任务及时间线；仅 `y` / `yes` 同意。拒绝、EOF 或中断返回 64，不发 HTTP。非 TTY 或 JSON 模式必须提供 `--yes`，即使 JSON 模式运行于 TTY 也不提示确认。

确认后才启动 30 秒取消窗口；只提交一次，无请求体、不预读、不重试、不切换身份或写入 profile。服务器检查 `demo.reset` 权限并在事务中重建任务及时间线，保留用户和角色。demo 身份与 reset 不是正式认证或生产运维机制。

成功 JSON 为 `{data:{reset:boolean}}`，无 meta；字段按 HTTP 合同原样保留。人类输出在 true 时说明已重置，在 false 时说明服务器返回未重置，两者均返回 0。错误沿用稳定信封与退出码；409 提示 `task list`，必要时通过 `task get` 核对，不附加版本。网络和协议失败保持 69/65，提示重置可能已提交并要求读取核对，不自动重放。

### 管理读取

所有管理读取命令均通过 SDK `admin.overview` 请求一次现有 `GET /api/v1/admin/overview`，不向 HTTP 添加查询参数。总览返回完整对象，三类列表分别提取 `users`、`roles`、`permissions`，默认保留服务器顺序及已逻辑删除记录。详情与筛选也必须先由 SDK 校验完整 overview，不能因目标不存在或筛选为空而忽略其他集合的协议错误。

`user get <user-id>`、`role get <role-id>` 按 ID 区分大小写精确匹配，`permission get <permission-code>` 按权限 code 精确匹配；不修剪或模糊匹配位置参数，支持查询已删除记录。完整响应中未找到目标时退出 66，stderr 返回本地 `usage` 错误，无伪造的 HTTP status/code/path。详情不接受列表筛选参数。

列表筛选在 CLI 内按 AND 组合，不排序、不修改资源：

- 三类列表支持 `--search`：搜索词去除首尾空白后，以 `toLocaleLowerCase('zh-CN')` 小写化包含匹配；全空白等同不筛选。用户搜索 ID、username、姓名、角色 ID/code/名称；角色搜索 ID、code、名称及全部权限码；权限搜索 code、名称、描述。字段按上述顺序以空格连接，不搜索日期或状态显示文案。
- 用户和角色列表支持 `--active true|false|all`，直接匹配服务器 `active`；支持 `--deleted true|false|all`，按 `deletedAt !== null` 判断。两个参数分别默认 `all`，停用不等于已删除。
- 无匹配记录返回成功空数组。非法筛选值、重复参数、缺失参数和不支持的选项在任何 HTTP 请求前退出 64。管理命令不接受任务的 `--status`。

```bash
noticeboard admin overview --user noticeboard-admin --json
noticeboard user list --user noticeboard-admin
noticeboard role list --user noticeboard-admin
noticeboard permission list --user noticeboard-admin
noticeboard user list --active false --deleted false --user noticeboard-admin
noticeboard role list --search tasks.view --user noticeboard-admin
noticeboard user get noticeboard-admin --user noticeboard-admin --json
noticeboard permission get system.manage --user noticeboard-admin
```

管理接口要求服务器授予 `system.manage`。公共配置优先级及 30 秒取消窗口照常生效，不预读身份列表、不自动切换管理员、不修改 profile；默认普通身份会收到 403。401/403 通过 stderr 返回错误并退出 77，协议错误退出 65，网络失败退出 69，不重试。

总览和列表的 JSON `data` 分别为 `AdminOverview`、`AdminUser[]`、`AdminRole[]`、`AdminPermission[]`；详情为单个完整 `AdminUser`、`AdminRole` 或 `AdminPermission`，均无成功 meta。人类输出为中文表格：用户显示 ID、用户名、姓名、角色 ID/名称、启用状态和删除时间；角色显示 ID、代码、名称、内置标记、权限码、启用状态和删除时间；权限显示代码、名称和描述。总览按用户、角色、权限的顺序组合三张表；空列表明确提示，远端文本统一转义终端控制字符。JSON 保留全部声明字段，包括更新时间。人类详情使用中文逐字段显示全部声明字段，包括用户角色代码和用户/角色更新时间，并转义每个远端值。

### 管理写入

```text
noticeboard user create --name <text> --role-id <id>
noticeboard user update <id> [--name <text>] [--role-id <id>]
noticeboard user delete <id> [--yes]
noticeboard user restore <id>
noticeboard role create --name <text> [--permissions <code,code>]
noticeboard role update <id> --name <text> (--permissions <code,code> | --clear-permissions)
noticeboard role delete <id> [--yes]
noticeboard role restore <id>
```

所有命令只通过 SDK `admin.users` / `admin.roles` 调用已有版本化 API，要求 `system.manage`。不自动选择管理员或修改 profile；公共配置与 30 秒取消窗口保持一致。每条命令仅提交一次写请求，不预读、不重试。管理 API 无版本字段，因此不接受 `--expected-version`，也不提供乐观并发保证。

用户创建要求名称与角色 ID；用户更新至少提供一个修改字段，省略字段不发送。名称与角色 ID 使用非空、无控制字符的文本规则，其余业务校验交给服务器。角色创建省略权限时采用服务器默认空权限；更新必须显式提交名称和完整权限列表，不从 overview 补齐。`--permissions` 按逗号分隔，每项去除首尾空白，拒绝空项、重复项和未知权限码；`--clear-permissions` 只用于角色更新，发送空数组，与 `--permissions` 互斥。用户 username 与角色 code 由服务器生成，不提供设置参数；`active` 仅供读取筛选。

删除是软删除，在任何 HTTP 请求前确认；非 TTY 或 JSON 模式必须提供 `--yes`，TTY 拒绝确认返回 64。创建、更新与恢复直接执行，不接受 `--yes`。非法或重复参数在请求前返回 64。服务器负责内置角色、角色占用及最后一名管理员保护，客户端不预检或复制这些规则。

创建接受 201，更新/恢复接受 200，JSON 输出 `{data: AdminUser}` 或 `{data: AdminRole}`，人类输出复用完整管理详情；删除接受 204，输出 `{data:{ok:true,id}}`，人类输出显示资源类型及 ID。管理写入没有成功 meta。所有远端值继续转义终端控制字符。

错误沿用现有信封与退出码：400→64、401/403→77、404→66、409/429→75、网络→69、协议→65。409 保留业务错误，提示使用 `user get` 或 `role get` 核对，不输出任务版本提示。网络或协议失败提示写入可能已提交；已知目标使用对应 `get` 核对，创建使用对应 `list` 查找后 `get` 核对，禁止自动重放。

### 任务与评论写命令

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

参数允许出现在命令前后。未知命令、未知选项、重复单值参数、缺少参数与多余位置参数返回 64。`--help` / `-h` 不读取配置或发起请求；与 `--json` 同用时返回 `{ "data": { "help": "..." } }`。

### 分层帮助与内置手册

`noticeboard --help`（或无参数）显示全部命令索引；`noticeboard task --help` 显示该资源的子命令；`noticeboard task create --help` 只解释该命令的用途、语法、位置参数、选项、必填项、默认值、枚举、互斥条件和示例。所有命令及资源层级均支持 `-h`。查看帮助不要求补齐业务必填参数；未知命令、未知或重复选项及不属于当前命令的选项仍退出 64。

```bash
noticeboard man                      # 完整中文使用手册
noticeboard man task                 # 任务资源手册
noticeboard man task create          # 单条命令说明
noticeboard man man                  # 手册命令说明
noticeboard man --help               # 手册入口用法
noticeboard man task create --json   # {"data":{"manual":"..."}}
```

`man [资源 [命令]]` 的主题必须为现有资源或完整命令；未知主题、多余位置参数返回 64。支持公共选项，连接与身份覆盖不生效，因为文档不访问服务。`man --help` 返回帮助信封，普通 `man --json` 返回 `{data:{manual:string}}`；成功退出 0，错误沿用现有 stderr 信封和退出码。

完整手册包括快速开始、全部命令、profile 和环境变量优先级、演示身份、文件/stdin、乐观并发、确认、JSON、退出码与错误处理。内容和命令目录随 CLI bundle 分发，脱离仓库、离线、非 TTY 或配置损坏时均可读。帮助与手册不读取配置、正文文件或 stdin，不请求服务器或触发确认，直接输出中文纯文本，不调用系统 man 或分页器。

任务写动作使用 API v1 机器枚举：

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

## 本机独立安装与升级

更新源码后，可用仓库内的一键脚本打包并更新 CLI：

```bash
sh scripts/update-cli.sh
```

脚本使用 POSIX sh，支持 macOS/Linux；也可以从任意目录用脚本的绝对路径调用。它自动选择 Node 24（依次为 `NOTICEBOARD_NODE` 绝对路径、PATH、`NVM_DIR`，后者默认 `~/.nvm`），验证 npm 11，打包当前源码后调用既有本机安装器。不会加载 nvm shell 脚本、修改 PATH 或默认 Node。默认查找所选 Node 的配套 npm，缺失时查找 PATH 中 npm 的真实路径；特殊布局可用 `NOTICEBOARD_NPM_CLI` 指定 npm-cli.js 绝对路径。运行时和安装路径均不绑定特定用户或 Node 小版本。

支持 `--help`、`--prefix <专用目录>` 和 `--bin-dir <入口目录>`，相对目录按调用时的工作目录解析。构建失败立即停止，不安装旧 tarball；同版本号重新打包也会更新安装内容，profile 保持不变。脚本不拉取 Git、不安装仓库依赖、不发布 registry 或部署服务器；首次使用或依赖锁文件变化时，先在 Node 24/npm 11 环境运行 `npm ci`。Windows 用户可在 WSL 中使用此脚本，原生 Windows 请使用 npm 打包和全局安装方式。

macOS/Linux 可使用固定 Node 24 的用户目录安装方式，不改变其他项目的默认 Node。构建与安装命令需要 Node 24.x、npm 11.x；先检查 `node --version` 和 `npm --version`，未加载正确运行时时可直接用已定位的 Node 24 绝对路径执行脚本。

在仓库内准备本地包并安装：

```bash
npm run cli:pack
npm run cli:install:local
```

`cli:pack` 从独立临时构建生成 `dist/packages/noticeboard-cli-local-0.0.0.tgz`，不发布 registry。安装脚本调用当前 Node 同目录配套 npm，以 `--offline --ignore-scripts` 安装至 `~/.local/share/noticeboard` 的专用全局 prefix，并创建 `~/.local/bin/noticeboard`。启动入口通过 POSIX `exec` 固定使用安装时 Node 24 的绝对路径，转发参数、信号和退出码，不依赖默认 `node`、源码仓库、构建目录或额外 SDK 安装。

确保 `~/.local/bin` 位于终端 PATH；当前本机登录 shell 已配置该目录。新开终端后可以在任意目录使用：

```bash
noticeboard --help
noticeboard man task create
noticeboard profile set local --base-url http://127.0.0.1:3000
noticeboard task list --json
```

上例地址指向已经运行的本机服务；连接开发实例时替换为宿主机应用公布的动态端口，连接远端时使用实际 URL。已有配置用户可创建新的 named profile，再显式 `profile use <名称>`；安装本身不修改任何 profile。帮助与手册可离线读取，业务命令需要可连接的 API；此安装不启动或管理服务器、PostgreSQL。

可用 `npm run cli:install:local -- --tarball <本地tgz路径> --prefix <专用目录> --bin-dir <启动入口目录>` 自定义位置。安装器拒绝覆盖无关同名入口或非 Noticeboard 专用目录；不要把 prefix 指向现有通用 npm 全局目录。

升级时重新执行打包和安装命令；安装器替换包及受管理入口，保留配置。tarball 可以另行复制归档，`npm run build` 会清理 `dist`，但不会影响已经安装的 CLI。若 Node 24 被升级或移除，使用新 Node 24 的绝对路径重新运行 `scripts/install-cli-local.mjs`，更新启动入口中的运行时路径。

卸载（在 Node 24/npm 11 环境执行）：

```bash
npm uninstall --global --prefix "$HOME/.local/share/noticeboard" noticeboard-cli-local
rm "$HOME/.local/bin/noticeboard"
```

仅删除自己安装的入口；使用自定义路径时替换上述路径。卸载保留 profile 配置以及 npm prefix 的空目录，不影响服务器数据。

## Demo 身份与未来认证

当前 API 使用 `X-Demo-User-Id`，它只是身份选择，不是正式认证。SDK 负责把 CLI 解析出的 demo user ID 注入请求，服务器仍是身份与权限的权威判断者。

未来正式认证只沿现有 SDK 认证注入边界扩展：

- CLI 配置可以保存 credential reference，但不直接保存秘密。
- 密码、token 或 refresh credential 应交给系统安全存储或专用凭据提供者。
- 本文不提前决定 JWT、session、OAuth、device flow、token 生命周期或登录协议。
- 正式认证到来后，demo `--user` 只可在明确的 demo profile 中继续存在，不能伪装成生产认证。

## 输入与交互原则

当前 `profile delete`、`comment delete`、`user delete`、`role delete` 和 `demo reset` 在非 TTY 或 `--json` 模式下必须提供 `--yes`。普通 TTY 仅输入 `y` 或 `yes` 才执行；拒绝、EOF 或中断均不修改配置并返回 64。文件/stdin 输入已用于任务创建和评论创建、编辑。

所有操作都必须能通过参数、文件或 stdin 非交互完成。`--description-file -` 与 `--content-file -` 表示从 stdin 读取；同一字段的直接参数和文件参数必须二选一。文件与 stdin 按 UTF-8 严格解码，允许多行并保留原文交给服务器规范化；读取失败、非法 UTF-8、全空白或含 NUL 的正文返回 64。缺少必填参数、非法机器枚举、非 `yyyy-mm-dd` 日期格式及非法版本参数也返回 64；版本只接受十进制正安全整数。业务日期、字段长度和状态权限由服务器判断。

CLI 不提供默认交互向导。缺少必填输入时返回 usage 错误，不在自动化环境中逐项询问。

危险操作只允许以下行为：

- TTY：默认请求确认，可用 `--yes` 明确跳过。
- 非 TTY：必须显式传入 `--yes`；缺少时拒绝执行。

评论、profile、用户和角色删除以及 demo reset 视为危险操作；任务动作（包括 close）直接执行，不接受 `--yes`。删除和重置确认在任何 HTTP 请求前完成。不能因为 stdin 不可交互而默认执行。

## 乐观并发与重试

全部远端命令不重试，共用一个 30 秒请求窗口，超时取消通过 SDK 映射为 network/69。写命令在本地输入读取及删除确认完成后开始计时，版本预读和提交共享该窗口。

任务生命周期、续期和评论写入必须使用任务 `version`：

1. 提供 `--expected-version` 时，CLI 直接用该版本提交。
2. 未提供时，CLI 先执行一次任务详情读取，并使用读取到的最新版本提交。
3. 服务端返回 409 时，CLI 不自动再次读取并重放操作；应显示服务器 `error.code`、本次使用的版本和重新 `task get` 的建议，并以退出码 75 结束。JSON 错误保留服务器信封字段，`meta.expectedVersion` 记录本次提交版本，`error.hint` 提供核对建议。

SDK 和 CLI 均不得默认重试非幂等写操作。网络在提交后断开时，客户端无法确定服务器是否已提交；此时应报告结果不确定并要求用户重新读取状态，不能自动重复评论或任务动作。写入 network 失败保持退出码 69，protocol 失败保持 65，并在 `error.hint` 提醒“可能已提交”；任务创建提示 `task list` 查找后 `task get` 核对，其余任务/评论写入提示 `task get`；管理写入使用对应 `user` / `role` 的 list/get 核对。预读失败不提交，也不标为写入结果不确定。

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

当前读取 JSON 的 `data`：任务列表为 `Task[]`，详情为 `Task`，身份列表为 `Identity[]`，当前/切换身份为 `Identity`。profile 列表为 `{name,baseUrl,demoUserId,current}[]`，show/set/use 返回单个同形对象；删除返回 `{ok:true,name}`。读取不输出成功 meta。任务与评论写命令成功的 `data` 为服务器返回的完整 `Task`；任务创建无 meta，其余任务/评论写操作带 `meta.expectedVersion`，表示提交使用的版本，而 `data.version` 为服务器结果版本。人类输出展示任务详情及评论 ID，便于后续编辑和删除；终端控制字符继续转义。

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

CLI package version 独立于 API v1、OpenAPI `info.version` 和 SDK package version。以下变更通常需要 CLI major 或迁移窗口：

- 删除或重命名命令、参数、环境变量或配置字段。
- 改变默认 profile/身份解析优先级。
- 改变 JSON 信封或退出码语义。
- 把原本非交互命令改为必须交互。
- 在非 TTY 中弱化危险操作的 `--yes` 要求。

人类输出新增提示或调整列宽通常可以兼容演进，但不能破坏脚本明确依赖的 `--json` 合同。

服务器 `npm run release` 只表示合并并永久部署，不发布 CLI。未来 npm publish 必须使用独立命令、验证和明确授权。
