# 告示牌 Noticeboard

告示牌（Noticeboard）是一个由 NestJS + Fastify 提供 API 和静态页面、以 PostgreSQL 为任务权威数据源的模块化单体。原生 TypeScript 前端保留原型的中文文案、hash 路由、无障碍契约和十套视觉主题。

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
- 单独运行 `test:e2e` 或 `test:visual` 且未提供 `E2E_BASE_URL` 时，会创建当前 worktree 专属的 `playwright` PostgreSQL；migration、seed、build、应用和浏览器仍全部在宿主机运行。
- `npm run verify` 使用独立的 `verify` PostgreSQL，依次执行格式、lint、类型、注释、架构、生命周期、宿主机构建、单元/API/contract、行为和零像素视觉测试，最后执行 `git diff --check`。
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
npm run verify                        # 宿主机完整交付门禁
npm run verify -- --final             # 为 clean 候选提交记录 verified ref
npm run deploy                        # 仅从 primary clean main 部署当前版本
npm run release -- ...                # 合并候选、部署、失败 revert 与补偿部署
```

## 项目结构

- `apps/api/src/{tasks,identity,authorization,health}`：按功能模块组织的 Domain / Application / Presentation / Infrastructure 代码。
- `apps/web/src/{core,tasks,profile,styles}`：API 客户端、内存状态、路由、渲染、交互和类型化主题。
- `apps/api/src/common/infrastructure/database/migrations`：唯一数据库模式变更入口。
- `tests/e2e`：行为测试与由旧原型冻结的视觉基线。
- `scripts/instance.mjs`：worktree PostgreSQL-only 生命周期。
- `scripts/local-app.mjs`、`scripts/run-local.mjs`：宿主机应用进程与开发入口。
- `scripts/verify.mjs`、`scripts/run-playwright.mjs`：宿主机验证与浏览器编排。
- `scripts/deploy.mjs`、`scripts/release.mjs`：main-only 永久部署和 release 事务。
- `docs/architecture.md`：架构决策、边界和事务设计。
- `Dockerfile`、`compose.deploy.yaml`：永久部署；`compose.yaml`：仅本地隔离 PostgreSQL。

## 健康与关闭

`GET /health/live` 只检查进程存活；`GET /health/ready` 探测 PostgreSQL，未就绪时返回 503。应用输出结构化 JSON 日志，并以 `application.ready` 事件公布实际监听 URL；接收终止信号后执行 Nest/Fastify 优雅关闭。
