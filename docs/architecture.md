# 架构决策

## 产品方向与实施状态

告示牌采用 **API 核心、CLI-first、Web maintenance-only** 的长期方向：版本化 HTTP API 是跨进程业务能力边界；CLI 将成为主要交互入口；未来 TUI 与可能独立发布的 SDK 复用同一 HTTP SDK。现有 Web 保留运行和维护，但不再承接常规产品功能开发。

本文同时描述当前架构与目标架构。tracked OpenAPI v1 artifact、稳定 operationId、服务端漂移检查、显式受支持基线兼容门禁、internal generated Fetch transport / artifact → generated 漂移门禁和只读手写 HTTP SDK 已经实现。只读 CLI 与本地私有安装包也已实现。SDK/CLI 写操作、npm registry 发布和 TUI 仍属于尚未实现的目标合同，不能据此假定仓库中已经存在对应命令或发布包。

当前仍是模块化单体：唯一的 NestJS + Fastify 进程同时提供版本化 API、健康检查、运行时 OpenAPI 和编译后的静态页面。应用实例无状态，PostgreSQL 是服务器任务与时间线的权威数据源。现有架构不包含 SQLite、Redis、CQRS、Outbox、Event Sourcing、Helm 或正式认证。

```text
当前：
原生 TypeScript 页面 ── REST / OpenAPI ── NestJS 表现层
                                             │
                                      应用用例与端口
                                             │
                                       纯领域聚合
                                             │
                           TypeORM Data Mapper / PostgreSQL

同一 AppModule ── 确定性生成/漂移检查 ── tracked OpenAPI v1 artifact
                                             │
                                   Orval 生成/完整树漂移检查
                                             │
                  apps/cli/src/sdk/internal/generated/transport.ts
                                             │
                            handwritten SDK（tasks / identities 只读）
                                             │
                          CLI（profile / identity / task list/get）

目标：
API 模块化单体
  └─ HTTP /api/v1
       └─ tracked OpenAPI v1 artifact
            └─ internal generated transport
                 └─ handwritten HTTP SDK
                      ├─ CLI（主要交互入口）
                      └─ future TUI

冻结 Web ── 现有手写 ApiClient ── HTTP /api/v1
```

服务端继续保持模块化单体，不因 CLI 拆分服务。CLI、TUI 和 SDK 只能经 HTTP/OpenAPI 使用业务能力，不得在进程内调用 API Feature 的 Domain、Application、Nest Module、DTO、ORM 或数据库。

## 模块、公共合同与依赖方向

`tasks`、`identity`、`authorization`、`health` 是一级 Feature 边界；Domain / Application / Presentation / Infrastructure 是 Feature 内部的二级边界。一个 Feature 只能导入另一个 Feature 的 `public/` 合同，不能直接访问其领域、用例、控制器、Guard、ORM 实体等内部实现。公共合同保持窄小，只包含实际需要的类型、port/token 和声明式 Nest integration；public 文件不得通过 re-export 将内部实现伪装成公共 API。

必须区分两类 public contract：

- **服务端内部公共合同**：`apps/api/src/<feature>/public/`，只服务模块化单体内部的跨 Feature 协作，不是 npm SDK 或客户端导入入口。
- **外部稳定合同**：HTTP `/api/v1` 的路径、方法、字段、枚举、状态码、错误语义与身份头；tracked OpenAPI v1 artifact；SDK 根入口导出的 API；CLI 命令、参数、配置、JSON 信封、stdout/stderr 和退出码。

业务模块内部遵循：

- Domain：纯 TypeScript 的聚合、值和规则；不依赖框架或基础设施。
- Application：协调用例与事务；只依赖领域和窄端口。可使用有限的依赖注入装配能力，但业务语义不依赖框架运行时。
- Presentation：控制器、DTO 校验、demo guard、OpenAPI 和统一 HTTP 错误映射。
- Infrastructure：TypeORM 实体、映射器、查询、仓储、迁移、seed、日志和运行配置。

分层边界按依赖性质定义，而不是按当前依赖包名单定义。Domain 不得出现框架、传输、持久化、数据库或装饰器依赖；Application 不得依赖 ORM Entity、ORM 运行时对象、HTTP 运行时类型或直接 SQL。核心层通过显式参数和窄端口声明依赖，禁止以服务定位器、全局事务上下文或类似隐式机制取得基础设施能力。通用 Repository/Service 基类会抹平聚合语义和用例边界，因此业务持久化与服务合同必须表达具体能力，不能退化为通用 CRUD 抽象。

DTO、领域模型、读取投影与 ORM 实体分别建模。ORM 实体不会从控制器返回。Feature-specific ORM 映射仍由所属 Feature 管理；需要共享事务的跨 Feature 基础设施协作使用明确的 public persistence contract，不把实体搬入 `common`。

`apps/api/src` 的直接顶层文件是 Composition Root，负责 Nest Module、全局 DataSource、migration 和 seed 组装。只有这些文件可以导入 Feature 的 `public/composition/` 注册入口；普通 Feature、`common` 和嵌套顶层代码不能使用该入口，Composition Root 也不能直接导入 Feature 私有实现。`common` 只能被 Feature 依赖，不能反向依赖任何 Feature。

当前 `scripts/check-architecture.ts` 自动识别任意 `apps/api/src/<feature>/...`，检查 Feature Boundary、Composition Root 例外、循环、逆向层依赖、核心层框架泄漏和通用仓储/服务基类；新增 Feature 无需修改规则名单。当前门禁也扫描已存在的 `apps/cli/src`，强制以下方向（只读 CLI 已实现，TUI 仍为目标）：

```text
OpenAPI artifact → generated transport → handwritten SDK → CLI / TUI
Web → existing Web ApiClient → HTTP /api/v1
```

以下依赖永久禁止：

- SDK、CLI 或 TUI 导入 API、Web、Feature `public/`、Nest DTO、ORM 或数据库代码。
- CLI 或 TUI 直接导入 generated transport 或 SDK internal 子路径。
- Web 导入 SDK、CLI 或 TUI；API 反向导入任何客户端层。
- generated transport 反向依赖手写 SDK。

## 用例、查询与事务

写用例由应用层决定显式事务边界，并通过表达聚合语义的 Repository Port 完成状态变更。事务回调只获得当前用例所需的事务内持久化能力，不向应用层暴露 ORM 运行时对象、通用 Unit of Work 或隐式全局事务。读用例通过面向读取需求的 Query Port 返回投影；列表、统计和详情等读取需求不必为了复用写模型而恢复领域聚合。

跨 Feature 授权通过窄公共端口提供有效权限判断；管理类写操作通过专用能力端口和显式事务完成，不能绕过所属 Feature 的规则。并发写入必须带预期版本条件，条件失败视为乐观冲突。任务生命周期操作、评论创建、评论编辑和评论删除共享同一个任务预期版本与事务边界；一次聚合更新与其新增事件必须使用同一底层 PostgreSQL 事务，保持状态、版本和有序事件一致。

HTTP SDK 必须显式保留 `expectedVersion` 契约。未来 CLI 在用户显式提供版本时直接提交；未提供时只允许先读取一次最新任务并使用该版本。收到 409 后不得自动刷新并重放动作、续期、评论创建、编辑或删除，也不得对结果不确定的非幂等写请求做网络重试；CLI 应返回稳定的临时冲突退出码并提示重新读取服务器状态。

## 数据与 HTTP 契约

PostgreSQL 持久化账户、角色与权限关系、任务及有序任务事件。账户具有由稳定账户 ID 派生、暂不可设置的唯一 `username`；任务事件同时保存操作人的显示信息和 username 快照。时间线事件是 append-only 的生命周期操作、评论创建、评论编辑和评论删除联合：每次真实编辑都追加包含完整新正文的编辑事件，公开读取投影仍在创建事件的原位置折叠出最新正文和 `edited` 标记，不公开原始编辑事件或修订历史；删除评论追加删除事件并保留全部数据库历史，公开投影只返回 tombstone，禁止返回创建正文、任一编辑正文或原始删除事件。数据完整性由外键、唯一约束、必要索引、事件形态检查和乐观版本列共同维护；账户与角色采用逻辑删除。数据库模式只通过 migration 演进，所有运行环境永久使用 `synchronize: false`。

部署 seed 幂等初始化演示身份，并且只在任务数据为空时于单一事务中初始化演示任务；只有显式 reset 才替换任务数据。seed 与 reset 不读取浏览器或客户端配置，也不能绕过 Feature 所属的持久化边界。

HTTP 使用 URI 版本 `/api/v1`。Nest controller、DTO 和 metadata 是 authoring source；提交的 `openapi/v1/noticeboard.openapi.json` 是稳定枚举、字段、状态码与 demo-only 身份头的可审查客户端合同，运行时 `/api/openapi.json` 必须与其语义一致，且两者都只包含 `/api/v1/*`。实际存在的 `/health/live` 与 `/health/ready` 是未版本化运维端点，不进入客户端 artifact。公开任务时间线以判别联合区分生命周期活动和评论，读取适配器必须在进入 HTTP 契约前完成删除脱敏。本文不复制 DTO 字段以避免双重真相。演示身份头、demo 路由、seed 和 reset 只服务演示环境，不构成正式认证或生产安全边界。

### OpenAPI artifact 与漂移治理

当前由真实 Nest controller、DTO 和 `AppModule` 确定性生成并提交 `openapi/v1/noticeboard.openapi.json`。Nest metadata 仍是 authoring source，不再手工维护平行 YAML/JSON；tracked artifact 是后续 SDK codegen、兼容比较和客户端发布构建的唯一输入。管理员用户和角色 restore 已统一为 HTTP 200，所有公开 operation 均具有稳定、唯一、资源化的 `operationId`。

`npm run openapi:generate` 先以 tsc 编译真实 API graph，再稳定排序并原子替换 artifact；`npm run openapi:check` 重建后执行字节比较；`npm run openapi:compatibility` 将候选与 `openapi/v1/baselines/*.openapi.json` 中按 SemVer 命名、显式提交且不可改写的全部受支持快照比较。兼容检查不读取 Git 历史，基线目录为空时失败关闭，避免 shallow checkout 漏检或把未发布分支中间态误当作永久合同。生成结果不得包含构建时间、主机名、动态 server URL 或其他环境差异。当前验证覆盖：

- 当前服务端生成结果与 tracked artifact 字节一致。
- runtime `/api/openapi.json` 与 tracked artifact 语义一致，且不混入未版本化 health 运维端点。
- v1 候选相对全部显式受支持基线没有结构性 breaking change。
- tracked candidate 重建出的完整 generated tree 与提交内容字节一致。

默认排序、错误码语义、身份处理、事务提交、乐观并发和脱敏继续由契约测试与人工审查固定。当前 `npm run client:generate` / `npm run client:check` 使用精确锁定的根开发依赖 `orval@8.28.1`，只从 tracked candidate 生成 `apps/cli/src/sdk/internal/generated/transport.ts`。通过 `scripts/openapi-fetch-client.ts` 的 Orval 官方 client 扩展，直接从 operation 元数据生成 native Fetch 单文件输出，无运行时包依赖，不使用 mutator、输入转换、生成后补丁或格式化；单文件内部不需要跨文件 import。首次选型试验中 Hey API 0.99.0 bundled Fetch 无法通过现有 `exactOptionalPropertyTypes`，因此采用通过同一类型与 wire 验收的 Orval。

Orval 8.28.1 默认 Fetch 模板使用大小写敏感的对象 spread 合并 Content-Type，会使调用方 `Headers` 产生重复媒体类型及 HTTP 415。因此仓库维护请求生成模板，仍复用 Orval 的 schema 类型生成与文件输出；不修改默认生成器返回的文本，也不对生成文件做补丁。模板复制原生 `Headers`，仅在缺少 Content-Type 时填入 JSON 默认值。当前支持 v1 必填路径参数、JSON 请求与明确数字状态码的 JSON/空响应；未支持的 query、非 JSON 等 wire 形态使生成失败，必须先扩展模板及合同验证。

Generated transport 接收每调用的 `RequestInit` 与 `fetchFn`，由调用方的 Fetch 闭包绑定每实例 base URL；identity 和 AbortSignal 经请求选项注入，不修改全局 Fetch。HTTP status 与响应数据/错误信封保留；日期为字符串，网络、取消与 JSON 解析失败拒绝 Promise，无写重试。当前只读手写 SDK 在其上提供请求头提供者、错误映射与 public 入口，generated 自身仍不提供运行时资源校验。

生成和检查先写临时树；generate 使用同文件系统的 staging 替换旧目录，替换失败尝试恢复旧树，恢复失败保留备份并报告路径。此流程保证受控失败的恢复，不声称跨进程或进程崩溃时原子切换。check 比较完整 POSIX 相对文件集合和原始字节，不改写 tracked tree；临时目录在 finally 清理，缺失、变化和陈旧文件均阻止验证通过。

只有真实 `apps/cli/src/sdk/internal/generated/**` 路径豁免 ESLint、Prettier 和手写注释要求，仍接受根 strict TypeScript、架构导入和运行时循环检查。API/Web source roots 必须存在，CLI root 仅在尚未创建时可选。门禁覆盖静态 import/re-export、inline type-only、import type expression、字面量动态 import 和 require；客户端计算式动态依赖禁止。SDK public entry 固定为 `apps/cli/src/sdk/index.ts`，通过 TypeScript 符号解析禁止 generated 符号经手写 barrel 间接导出。手写 SDK 可依赖 generated，但不能导入 API/Web/CLI 或服务器框架/持久化包。SDK 构建合同测试额外解析公共声明的传递依赖，禁止 generated 类型通过手写别名或方法签名泄漏。

### 版本与兼容政策

以下版本各自表达不同合同，不要求机械同步：

- URI `/api/v1`：HTTP wire contract 的 major。
- OpenAPI `info.version`：v1 契约自身的 SemVer。
- SDK package version：SDK public exports 的 SemVer。
- CLI package version：命令、参数、配置、JSON 和退出行为的 SemVer。

v1 通常允许新增 endpoint、可选响应字段以及具有旧行为默认值的可选请求或查询字段。删除或重命名路径/字段、收紧 requiredness 或校验、修改类型/格式/成功状态码、改变错误信封或既有错误码语义、修改默认排序、把数组响应替换成分页对象，均属于 breaking change，必须使用新 HTTP major 或明确迁移窗口。

在没有开放枚举与 unknown fallback 设计前，新增枚举成员也按潜在 breaking change 处理。未来分页不得直接改变当前 `/api/v1/tasks` 的默认数组响应形状。

完整政策见 `docs/api-compatibility.md`。

## SDK 当前能力与目标边界

SDK 是传输客户端，不是服务器应用层的进程外镜像。第一阶段不独立发布 SDK，而是在仓库内形成可单独 typecheck、build 和 test 的逻辑边界，并 bundle 到唯一发布的 CLI npm 包；当 SDK 需要独立发布或 CLI/TUI 成为两个真实消费者时，再引入 npm workspaces。

当前只读 SDK 提供 `createNoticeboardClient`、`tasks.list/get` 和 `identities.list`。唯一入口为 `apps/cli/src/sdk/index.ts`；通过 `sdk:typecheck`、`sdk:build` 和 `test:sdk` 独立检查、构建和测试，输出 `dist/sdk` ESM 与声明，尚无独立 npm 包。根 build 包含 SDK，verify 包含独立 SDK 类型检查，SDK 单元/构建合同与真实宿主机 HTTP smoke 分别进入 unit / API 门禁。服务器镜像仅复制 `dist/api` 与 `dist/web`。

SDK 依赖和行为：

- generated transport 只位于 internal 目录，不从 SDK 根入口导出，生成器符号和文件名不构成 public API。
- 手写资源 façade 当前提供稳定的 `tasks`、`identities` 只读方法与独立声明的稳定类型名；`comments` 和全部写操作仍为后续目标。
- SDK 构造器接收 base URL、认证/身份提供者、`fetch` 和取消信号；不读取 CLI 配置文件，不持久化 profile，不打印 stdout/stderr。
- SDK 统一暴露 API、网络和协议错误，并保留 HTTP status、服务器 `error.code`、message、details、path 和 timestamp。错误码按开放字符串透传。
- SDK 不自动重试非幂等写请求，也不替 CLI 隐藏乐观并发。
- 正式认证只预留请求认证注入边界；当前不提前决定 JWT、session、OAuth、token 生命周期或登录协议。

当前构造参数为必填 `baseUrl`、可选 `fetch`、每次请求求值的同步/异步 `getHeaders` 和默认 `signal`。base URL 支持路径前缀，禁止凭据、查询和 fragment；提供者返回的请求头经复制注入，SDK 不选择默认 demo 身份。默认与单次 signal 合并，任一取消都终止请求；取消归为 network 错误的 `aborted` reason。请求不重试、不缓存、不筛选。无效 base URL 抛出 `TypeError`，提供者异常原样传播。

只读响应按 tracked OpenAPI 校验全部已知字段的类型、必填性、闭合枚举、nullable 和时间线联合，容忍新增字段并仅映射已声明字段。SDK 不推导服务器业务规则或修改评论 tombstone。合法 HTTP 错误信封保留状态与所有已知错误字段；非法 JSON、结构错误和意外成功状态归为 protocol，保留可取得的 HTTP status；连接和响应读取失败归为 network 并保留 cause。使用方式和精确公共合同见 `docs/sdk.md`。

## CLI 当前能力与目标边界

CLI 是远程服务端客户端，只调用 HTTP SDK，不直接访问 PostgreSQL、migration、服务器用例或现有运维脚本内部能力。当前实现 profile、demo identity、task list/get，使用 Node 原生参数解析，严格拒绝未知/重复参数。任务创建、生命周期、续期和评论写入尚未实现。完整首发目标采用资源型命令，范围包括：

- `profile`：named profile 的查询、设置、切换与删除。
- `identity`：demo 身份列表、当前身份和切换。
- `task`：列表、详情、创建、生命周期动作和续期。
- `comment`：创建、编辑和删除。

用户/角色/权限管理、demo reset 和 TUI 不属于首发范围。`task list` 可基于现有完整任务列表在客户端实现 `--mine`、`--status` 和 `--search`，不得因此复制或改变 `/api/v1/tasks` 的 wire contract。

CLI 配置使用版本化 JSON schema 和 XDG/平台系统配置目录。一个配置文件可包含多个 named profile；每个 profile 第一阶段只保存 base URL 和当前 demo user ID，不保存任务、响应缓存或秘密。配置解析优先级固定为：

```text
命令参数 > NOTICEBOARD_* 环境变量 > 当前 profile > 本地 demo 默认值
```

`--profile`、`--base-url` 和 `--user` 只覆盖当前命令，不隐式改写配置；身份切换命令显式更新当前 profile。`currentProfile` 必须始终指向现存 profile；禁止直接删除当前激活 profile，用户必须先显式切换到另一个 profile，不能由删除命令隐式选择 fallback 或清空当前 profile。所有 profile 配置变更必须在一次原子替换中维持该不变量，并使用当前用户权限。未来正式凭据只在配置中保存引用，秘密由认证提供者或系统安全存储管理。

CLI 默认输出人类可读文本或表格；`--json` 成功输出统一的 `{ "data": ..., "meta"?: ... }` 信封。stdout 只承载结果，stderr 承载错误、警告和诊断；JSON 模式不得混入 banner、进度或调试文本。退出码必须稳定区分成功、usage/本地输入、协议、资源不存在、网络/服务不可用、临时冲突以及身份/权限失败。

CLI 进程入口处理异步输出流错误：stdout 的 EPIPE 视为下游主动结束消费，安静返回 0；其他 stdout 写入错误返回 1 并尽可能输出受控诊断，stderr 写入失败返回 1 且不递归报告。有效请求身份统一使用 Headers 规范化后的值进行 HTTP 注入和本地身份/归属比较，不因读取操作修改 profile 文件。

全部操作必须可由参数或 stdin 非交互执行。只有危险操作可在 TTY 中请求确认并接受 `--yes` 跳过；非 TTY 环境缺少 `--yes` 时必须拒绝执行，不能因无法确认而默认继续。默认格式不能因为 stdout 被管道连接而自动切换为 JSON。

CLI npm 包名在公开发布前另行确定；可执行文件为 `noticeboard`。首版只通过内部或私有方式发布。包内容必须使用白名单，不能携带 API/Web 源码、数据库代码、测试 fixture 或仓库配置。

当前配置缺失时只在内存中使用 local demo 默认值，显式配置修改才落盘。profile set 不切换激活项，省略身份时保留旧值或使用 demo 默认；identity use 必须先通过服务器有效身份列表验证，只更新当前激活 profile，拒绝选择其他 profile 后直接修改。所有配置修改使用同目录临时文件、文件同步和原子替换，POSIX 文件权限 0600；并行写入采用最后成功替换的快照，不做跨进程合并。JSON 删除必须使用 --yes，即使在 TTY 中也不提示确认。

任务 list 在 CLI 内按 AND 组合筛选并保持服务器顺序；mine 额外读取身份列表并忽略评论及失效生命周期操作人，search 固定搜索标题、类型标签、描述、发布者与接取者姓名，去除搜索词首尾空白后以 zh-CN 小写化包含匹配。远端命令共用 30 秒取消窗口，不重试。协议错误优先返回 65，包括 HTML 503；其余退出映射遵循 CLI 合同。

CLI 独立类型检查允许 Node 类型，SDK 独立类型检查仍只允许 Fetch/DOM 类型。根 build 用精确锁定的 esbuild@0.28.2 bundle CLI 和 SDK，生成 dist/cli 下无运行时依赖的 ESM 可执行文件与私有 manifest；本地占位包为 noticeboard-cli-local@0.0.0，不代表 registry 发布。包白名单只含 bin/noticeboard.js 与 README.md（npm 自动包含 manifest），实际 tarball 安装检查进入 unit 门禁，真实宿主机 HTTP smoke 进入 API 门禁，cli:typecheck 进入 verify。服务器镜像继续仅复制 dist/api 与 dist/web。

完整当前与目标合同见 `docs/cli.md`。

## Web 冻结边界

Web 进入 maintenance-only，继续使用 `apps/web/src/core/api-client.ts`、`apps/web/src/core/api-types.ts` 和当前浏览器状态模型，不迁移 generated transport 或新 SDK。允许的变更仅包括：

- 安全、浏览器兼容、无障碍和生产故障修复。
- 当前或未来受支持 HTTP API 主版本的兼容性修复，以及保持 Web 继续受支持所需的最小 API major 迁移。
- 依赖、构建和现有测试维护。
- 保持既有 DOM、ARIA、中文文案、路由、主题和视觉基线所需的修复。

API major 迁移不得借机新增 Web 产品功能、迁移 generated transport 或新 SDK，也不得扩大到与迁移无关的状态层、DOM 或视觉重构。不得把 CLI 新功能同步为 Web 功能，不得仅为代码复用重构现有 ApiClient、HTTP 类型或浏览器状态层，也不得从 Web 抽取供 TUI 使用的通用状态框架。Web 与新 SDK 共享的是 HTTP/OpenAPI 契约，不是 TypeScript 源码。

前端现有职责继续有效：客户端路由和页面状态驱动视图切换；筛选、搜索和统计基于内存快照；服务器授权和领域规则始终为权威；同一任务的命令执行期间阻止重复提交；失败或乐观冲突时重新同步服务器状态。浏览器只持久化当前演示身份和视觉偏好，秘密和服务器数据不得写入浏览器存储；用户内容只经 `textContent` 或安全节点工厂进入 DOM。

十套类型化主题继续保留；“瑞士国际”主题的桌面与移动视觉测试仍是唯一正式视觉基线，要求 `maxDiffPixels: 0`。Web 冻结不构成删除行为、API 或视觉回归测试的理由；它当前作为 API v1 的独立消费者参与兼容验证，未来迁移后继续验证对应的受支持 HTTP API major。

## 运行、构建与发布

服务器配置当前仅来自环境变量，并在启动时验证。PostgreSQL 连接、查询和 readiness 探测都有明确超时，意外异常在返回安全错误信封前写入结构化日志。宿主机应用必须显式提供监听配置：本地编排固定绑定 `127.0.0.1` 并以 `PORT=0` 取得操作系统动态端口，结构化 `application.ready` 事件公布实际 URL；永久容器显式监听 3000。存活检查不依赖数据库，就绪检查实际执行 PostgreSQL 查询。

永久部署与本地开发/验证是两种隔离拓扑。永久部署只能从 Git primary checkout 的 clean `main` 分支升级，固定使用 Compose project `noticeboard` 和应用端口 `127.0.0.1:3000`；其 PostgreSQL 只连接内部网络并使用持久卷。镜像使用多阶段构建，生产层只安装运行依赖并以非 root 用户启动，应用文件系统只读；migration 和非破坏性 seed 是先于无状态应用的一次性服务。部署入口只提供非破坏性升级，并在 Compose 启动后验证数据库 readiness、首页、OpenAPI 和数据库只读 API。linked worktree、其他分支和 detached HEAD 必须拒绝永久部署及其 dry-run。

本机开发与全部测试在宿主机执行 migration、seed、build、API 应用、Vitest、Node Test、Playwright 和 Chromium；Docker 在本地只承载 PostgreSQL。每个 worktree 按绝对路径和用途派生相互独立的 `dev`、`verify`、`playwright` Compose project、网络和数据库卷，数据库宿主机端口由 Docker 动态分配。生命周期操作以 project 锁避免并发修改；不同 worktree 的业务测试可并行。本机应用端口不得使用永久部署的 3000，也不得回退到固定 3100；PostgreSQL 不得回退到固定 54329。

完整验证和独立 Playwright 成功后删除各自 PostgreSQL 容器、网络及数据库卷，失败时保留数据库和测试产物，但宿主机应用进程始终停止。`dev` 的 `down`、`destroy` 以及验证清理只能作用于当前路径和用途派生的 project，不得操作永久 `noticeboard`。`npm run verify -- --final` 只验证 clean 候选提交并记录本地 verified ref，不执行永久部署。

标准 `npm run release` 在 primary `main` 校验候选 verified ref 后创建 no-ff merge commit，并立即执行永久服务器部署验证。失败补偿只允许对本次 release 创建且仍位于 HEAD 的 merge commit追加 revert commit，再从 revert 后源码尝试一次部署；不得改写 Git 历史、自动 push 或自动执行 migration revert。常规 migration 必须与上一应用版本向后兼容；破坏性或不可逆 migration 需要独立发布方案。

未来 npm package publish 是与服务器 release 完全独立的外部发布动作，必须使用独立命令、版本、验证和授权，不得复用 `npm run release`。第一阶段只发布内部/私有 CLI 包，SDK 不独立发布。CLI 加入构建后，服务器镜像只能使用 server-only 产物，不得把客户端包、SDK generated 源码或 npm 发布资产无意复制到生产镜像。

## 架构变更判定

在既有服务端边界内新增普通用例、读取投影、业务表或演示 fixture，不构成架构变化，无需更新本文。以下变化属于架构变化，必须同步更新本文和相应的可执行验证：

- 一级 Feature 拓扑、分层职责、依赖方向、Feature 公共合同、Composition Root 或 `common` 规则。
- 事务、一致性、数据持久化、认证、安全或部署拓扑。
- HTTP major、OpenAPI artifact 生命周期、兼容政策或错误语义。
- SDK public exports、generated/internal 边界或认证注入方式。
- CLI 命令、参数、配置 schema、JSON 信封、退出码、非交互和并发策略。
- Web maintenance-only 范围、浏览器状态或持久化架构。
- npm 包边界、独立 SDK 发布、workspace 化、TUI 引入或重大基础设施选型。
