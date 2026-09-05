# 告示牌 Noticeboard

告示牌（Noticeboard）当前是一个由 NestJS + Fastify 提供 API 和静态页面、以 PostgreSQL 为任务权威数据源的模块化单体。原生 TypeScript Web 保留中文文案、hash 路由、无障碍契约和十套视觉主题。

## 产品方向与当前状态

项目后续采用 **API 核心、CLI-first、Web maintenance-only** 的方向：CLI 将成为主要交互入口，未来 TUI 与可能独立发布的 SDK 通过同一版本化 HTTP SDK 使用 `/api/v1`；现有 Web 继续运行和维护，但不再承接常规产品功能开发。

提交到 Git 的 `openapi/v1/noticeboard.openapi.json`、稳定 operationId、服务端漂移检查和显式受支持基线兼容门禁已经实现。internal generated Fetch transport 与 artifact → generated 漂移门禁也已实现；手写 SDK、CLI 和 TUI 目前尚未实现。本 README 中的命令只描述当前可运行的 API/Web、transport 生成、数据库、测试和部署入口；目标 CLI 合同见 [`docs/cli.md`](docs/cli.md)，API v1 兼容政策见 [`docs/api-compatibility.md`](docs/api-compatibility.md)，完整依赖边界见 [`docs/architecture.md`](docs/architecture.md)。

第一阶段计划只交付一个内部/私有 CLI npm 包，SDK 先作为 CLI 内部的严格逻辑边界，不引入 npm workspaces，也不单独发布 SDK。npm 包名在发布前另行确定，可执行文件暂定为 `noticeboard`。

## 快速开始

项目支持任意 Node.js 24.x 与 npm 11.x。直接 npm 依赖、lockfile、PostgreSQL、Playwright/Chromium、Dockerfile frontend 和 esbuild 安装脚本授权仍保持精确版本。

Docker 在本机开发和测试中只用于 PostgreSQL。先确保 Docker daemon 已运行，再安装依赖：

```bash
npm ci
```

准备当前 worktree 的开发数据库：

```bash
npm run instance -- up
npm run instance -- status
```

`up` 只启动当前 worktree 的 `dev` PostgreSQL 容器，并在宿主机执行 migration 与非破坏性 seed。数据库仅绑定 `127.0.0.1`，宿主机端口由 Docker 动态分配。

在宿主机启动开发应用：

```bash
npm run start:dev
```

该命令复用并准备 `dev` 数据库、编译前端，然后在宿主机运行 `tsx --watch`。应用固定绑定 `127.0.0.1`，由操作系统分配动态端口并打印实际页面地址；本机进程不会占用永久部署使用的 `3000`。

停止数据库但保留数据，或彻底删除当前开发数据库：

```bash
npm run instance -- down
npm run instance -- destroy --yes
```

## 本机测试与最终验证

全部 build、migration、seed、Vitest、Node Test、API 应用、Playwright 和 Chromium 都在宿主机运行；Docker 只允许提供隔离 PostgreSQL。

```bash
npm run test:unit
npm run test:api
npm run test:contract
npm run test:e2e
npm run test:visual
npm run verify
```

- `test:api` 和 `test:contract` 的数据库套件要求 `DATABASE_URL_TEST`，缺少时会明确失败，不再静默跳过。可使用 `instance status` 打印的地址，或通过完整验证自动注入。
- `openapi:generate` 与 `openapi:check` 先编译真实 API graph，并要求 `DATABASE_URL` 指向可用 PostgreSQL；完整验证会自动使用隔离的 `verify` 数据库。`openapi:compatibility` 只读取候选 artifact 和 `openapi/v1/baselines/*.openapi.json` 中显式提交的受支持基线，不读取 Git 历史、fetch 或访问远端；基线目录为空时失败关闭。
- 单独运行 `test:e2e` 或 `test:visual` 且未提供 `E2E_BASE_URL` 时，会创建当前 worktree 专属的 `playwright` PostgreSQL；migration、seed、build、应用和浏览器仍全部在宿主机运行。
- `npm run verify` 使用独立的 `verify` PostgreSQL，依次执行格式、lint、类型、注释、架构、OpenAPI artifact 漂移与兼容、生命周期、宿主机构建、单元/API/contract、行为和零像素视觉测试，最后执行 `git diff --check`。
- 完整验证和 standalone Playwright 成功时删除各自数据库容器、网络和卷；失败时保留数据库及测试产物，但宿主机应用进程始终停止。`dev`、`verify` 和 `playwright` 数据库互不共享。
- 测试固定注入 `TASK_BUSINESS_TIME_ZONE=Asia/Shanghai` 与 `TASK_CURRENT_DATE_OVERRIDE=2026-09-01`，不会使用固定 `3100` 或 `54329` 回退端口。

已提交的候选分支在合并前执行：

```bash
npm run verify -- --final
```

`--final` 要求工作区和暂存区 clean，并要求验证期间 HEAD 不变。成功后只创建本地 `refs/noticeboard/verified/<sha>`；它不会执行 Docker 应用构建、永久部署或部署 dry-run。

## main 合并与永久部署

永久部署只能发生在 Git primary checkout 的 clean `main` 分支，不能从 linked worktree、功能分支或 detached HEAD 执行。永久实例固定为：

- Compose project：`noticeboard`
- 页面：`http://127.0.0.1:3000`
- PostgreSQL：只在部署内部网络开放，不发布宿主机端口
- 数据卷：`noticeboard-postgres`

直接重新部署当前 clean `main`：

```bash
npm run deploy
```

部署入口只执行 `docker compose ... up -d --build --wait`，不提供 `down`、volume 删除或 reset。Compose 启动后还会验证 `/health/ready`、首页、OpenAPI 和带演示身份的数据库只读任务 API；全部通过才算部署成功。

标准功能发布使用本地 merge 后立即部署的闭环：

```bash
npm run release -- feature/example \
  --expect-sha=<已完成-final-verify的40位SHA> \
  --confirm-auto-revert
```

release 会执行以下步骤：

1. 要求当前位于 primary checkout 的 clean 本地 `main`，且本地 `main` 与本地 `origin/main` 一致；
2. 校验候选 SHA 与 final verified ref；
3. 创建 `--no-ff` merge commit；
4. 立即部署并执行 readiness/smoke；
5. 若部署失败且 HEAD 仍是本次 merge，则创建 `git revert -m 1` commit，并从 revert 后源码尝试一次补偿部署。

release 不会自动 fetch、push、reset、force push、删除分支或执行数据库 migration revert。补偿部署仍失败时会停止自动操作并保留现场。数据库 migration 必须兼容上一应用版本；破坏性 migration 需要单独发布方案。发布成功后，只有获得明确授权才另行 push `main`。

这里的 `npm run release` 只表示服务器候选合并、永久部署与失败补偿，不执行 npm version、tag、changelog、CLI/SDK publish 或 registry 登录。未来客户端 npm publish 必须使用独立入口、独立验证，并再次获得明确授权。

linked worktree 中禁止 `deploy`、`release` 及其 `--dry-run`。这些 Git 和部署行为也必须获得当前任务中的明确授权。

## 演示行为与数据

- 独立的 `noticeboard-admin` 演示身份负责用户与角色管理；`noticeboard-master`、`adventurer-a`、`adventurer-b` 保持普通用户任务身份。
- 角色权限控制任务 API 和管理 API；管理员拥有全部权限，普通用户拥有全部任务操作权限但不能管理用户、角色或重置演示数据。
- “我的任务”归属于时间线中最后一位仍有效的任务生命周期操作人；发表评论、编辑评论或删除评论不会改变任务归属。
- 拥有任务查看权限的用户可在未关闭任务上发表最多 1000 字的纯文本评论；仅原作者可编辑未删除的评论，编辑后显示“已编辑”，管理员不能改写他人评论；评论作者和系统管理员可以删除，删除后保留带唯一 `@username` 的时间线占位。
- 评论创建、每次编辑和删除都以 append-only 事件保存在 PostgreSQL 中；公开 API 只返回最新正文和 `edited` 标记，删除后不会返回创建正文或任一编辑正文。
- PostgreSQL 保存角色、角色权限、带唯一 username 的账户、任务和有序时间线。demo reset 仍只在一个事务中恢复演示数据。
- `localStorage` 只保存 `{currentUserId}`（键 `noticeboard-user`）和视觉偏好（键 `noticeboard-style`）；不要在本地存储中保存秘密。

`X-Demo-User-Id`、`/api/v1/demo/*`、seed 与 reset 均为 demo-only。HTTP 请求与响应字段只以 OpenAPI 文档为准。

## 常用命令

```bash
npm run build                         # 在宿主机编译 API、前端与静态页面
npm run start:dev                     # 准备 dev PostgreSQL 并启动宿主机 watcher
npm run instance -- status            # 显示当前 dev PostgreSQL 和动态连接地址
npm run db:migrate                    # 使用 DATABASE_URL 执行 migration
npm run db:revert                     # 手动回退最近一次 migration
npm run db:seed                       # 幂等写入身份，仅为空任务表初始化任务
npm run test:unit                     # 领域、应用与前端单元测试
npm run test:api                      # HTTP 契约及真实模块集成测试
npm run test:contract                 # PostgreSQL 仓储契约测试
npm run test:e2e                      # 宿主机 Chromium 行为测试
npm run test:visual                   # 宿主机桌面/移动零像素视觉测试
npm run openapi:generate              # 从真实 AppModule 重新生成 tracked v1 artifact
npm run openapi:check                 # 字节检查服务端与 tracked artifact 漂移
npm run openapi:compatibility         # 对比显式提交的全部受支持 v1 基线
npm run verify                        # 宿主机完整交付门禁
npm run verify -- --final             # 为 clean 候选提交记录 verified ref
npm run deploy                        # 仅从 primary clean main 部署当前版本
npm run release -- ...                # 合并候选、部署、失败 revert 与补偿部署；不发布 npm 包
```

## 项目结构

- `apps/api/src/{tasks,identity,authorization,health}`：按功能模块组织的 Domain / Application / Presentation / Infrastructure 代码。
- `apps/web/src/{core,tasks,profile,styles}`：API 客户端、内存状态、路由、渲染、交互和类型化主题。
- `apps/api/src/common/infrastructure/database/migrations`：唯一数据库模式变更入口。
- `tests/e2e`：行为测试与由旧原型冻结的视觉基线。
- `scripts/instance.mjs`：worktree PostgreSQL-only 生命周期。
- `scripts/local-app.mjs`、`scripts/run-local.mjs`：宿主机应用进程与开发入口。
- `openapi/v1/noticeboard.openapi.json`：从真实 AppModule 确定性生成并提交的当前 HTTP 合同。
- `openapi/v1/baselines/*.openapi.json`：按 SemVer 命名、显式保留且不可改写的受支持 v1 兼容快照。
- `scripts/openapi-artifact.ts`、`scripts/check-openapi-compatibility.ts`：artifact 生成、漂移和显式基线兼容门禁。
- `apps/cli/src/sdk/internal/generated/transport.ts`：从 tracked candidate 生成的内部 Fetch transport，禁止手改。
- `scripts/generated-transport.ts`：完整生成目录的确定性生成、替换恢复与漂移门禁。
- `scripts/verify.mjs`、`scripts/run-playwright.mjs`：宿主机验证与浏览器编排。
- `scripts/deploy.mjs`、`scripts/release.mjs`：main-only 永久部署和 release 事务。
- `docs/architecture.md`：当前架构、CLI-first 目标、依赖边界和事务设计。
- `docs/cli.md`：尚未实现的 CLI v1 命令、配置、输出、退出码和并发目标合同。
- `docs/api-compatibility.md`：API v1、OpenAPI artifact、SemVer、兼容变化与迁移政策。
- `Dockerfile`、`compose.deploy.yaml`：永久部署；`compose.yaml`：仅本地隔离 PostgreSQL。

`apps/cli` 当前只包含 internal generated transport；手写 SDK public façade、CLI 命令、独立包和构建产物均未实现。首个 CLI 版本稳定后，只有在 SDK 需要独立发布或 TUI 成为第二个真实消费者时才评估 npm workspaces。

## Internal Fetch transport

```bash
npm run client:generate
npm run client:check
```

唯一输入为 `openapi/v1/noticeboard.openapi.json`，输出为 `apps/cli/src/sdk/internal/generated/transport.ts`。根开发依赖精确锁定 `orval@8.28.1`，通过 `scripts/openapi-fetch-client.ts` 的 Orval client 扩展直接生成 native Fetch 请求、运行时 Fetch 参数和原始 HTTP status；不生成 SDK public façade，也不安装客户端运行依赖。日期保持字符串，错误信封原样保留，网络/JSON 解析/取消失败拒绝 Promise，写请求不自动重试。

生成模板使用 `new Headers` 复制调用方请求头，只在 `headers.has('content-type')` 为假时设置 JSON 默认值，避免大小写不同的键被 Fetch 拼接成重复媒体类型。当前模板覆盖 v1 的必填路径参数、JSON 请求与明确数字状态码的 JSON/空响应；新增 query、非 JSON 或其他未支持形态时生成失败，必须先补模板与合同测试。

Generated operations 接收 `RequestInit` 与可选的 `fetchFn`；后续手写 SDK 将通过每实例的 Fetch 闭包绑定 base URL，并通过请求选项注入 demo 身份与取消信号。当前没有 SDK 构造器或 profile。生成物使用相对 API URL，Node 调用方应显式注入绑定 origin 的 Fetch。

`client:generate` 先生成完整临时目录再替换旧树，替换失败恢复旧树；恢复也失败时保留备份路径供人工恢复。此过程不承诺跨进程或进程崩溃时的目录事务。`client:check` 在临时目录重建，按 POSIX 相对路径与原始字节报告 missing/changed/stale，不写 tracked tree。两个命令均不需要数据库；生成物不手改，不执行格式化补丁。完整 `verify` 已在 OpenAPI 漂移与兼容检查后接入 `client:check`。

## 后续客户端阶段

当前已完成管理员 restore HTTP 200 对齐、确定性 OpenAPI v1 artifact、稳定 operationId，以及服务端漂移、显式受支持基线兼容和 artifact → generated 漂移门禁。下一阶段按以下顺序推进：

1. 在已治理的 internal transport 上实现只读手写 HTTP SDK，隔离生成器实现、错误映射和认证注入。
2. 交付 profile、demo identity、`task list/get` 和稳定 `--json`/退出码的只读 CLI。
3. 加入任务创建、动作、续期和评论写入；未显式提供 expected version 时只预读一次，409 后不自动重放。
4. SDK 与 CLI 合同稳定后再评估管理资源、独立 SDK 发布、workspaces 和 TUI。

## 健康与关闭

`GET /health/live` 只检查进程存活；`GET /health/ready` 探测 PostgreSQL，未就绪时返回 503。这两个未版本化端点属于运维表面，不属于 `/api/v1` 客户端合同，因此不进入 tracked artifact 或运行时 `/api/openapi.json`。应用输出结构化 JSON 日志，并以 `application.ready` 事件公布实际监听 URL；接收终止信号后执行 Nest/Fastify 优雅关闭。
