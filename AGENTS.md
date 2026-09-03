# 仓库贡献规则

## Agent 命令执行前置规则

- 在 linked worktree 中执行命令时，始终以当前 worktree 为工作目录，并使用可静态确认的字面量命令与参数。直接调用当前环境中的可执行文件；需要定位指定大版本的 Node/npm 时，先用独立命令取得其绝对路径，再以该字面绝对路径执行。不得在复合命令中使用 `source`、动态拼接或覆盖 `PATH`，也不得使用 `git -C`、子 shell 或其他方式转向主工作目录或 worktree 外部路径。
- **linked worktree 中禁止永久部署和 release，包括 `npm run deploy`、`npm run release`、直接调用 `scripts/deploy.*` 或 `scripts/release.*`，以及这些入口的 `--dry-run`。** worktree 只能使用本地 PostgreSQL 实例和宿主机进程完成开发与最终验证。
- merge、release、deploy、自动 revert、fetch 和 push 均属于外部或难逆操作；只有用户在当前任务中明确授权时才能执行。release 成功不会自动 push。

## 架构约束

- 仓库采用按 Feature 划分的模块化单体；完整架构定义、分层职责、依赖方向、公共契约、数据与事务边界以 `docs/architecture.md` 为唯一事实源。涉及架构的任务必须先阅读该文档。
- 必须保持既有分层依赖方向和 Feature 公共边界；不得通过内部跨 Feature import、re-export 或其他方式绕过公共契约。
- 需求若改变既有架构决策，必须同步更新 `docs/architecture.md` 和相应验证，不得静默改变架构。
- `npm run architecture` 是架构边界的可执行门禁；不得削弱、绕过或针对性规避检查器来容纳违规实现。

## 数据与安全硬约束

- 除非任务明确改变架构范围，不得擅自引入 SQLite、Redis、CQRS、Outbox、Event Sourcing、Helm 或正式认证等重大技术。
- `X-Demo-User-Id`、demo 路由、seed/reset 均为 demo-only，不得视为正式认证或生产安全机制。浏览器只保存当前演示身份和视觉偏好，不保存任务或秘密。
- OpenAPI 是唯一 HTTP 字段契约；改变字段、枚举或状态码时，必须先更新失败测试和 OpenAPI 描述。

## 环境与验证前置条件

- 项目仅限制 Node `24.x` 与 npm `11.x`；不限制同一大版本内的 minor 或 patch。运行测试前先检查 `node --version` 和 `npm --version`；如果出现 `node:util` 缺少 `styleText` 的 Vitest/Rolldown 启动错误，通常是误用了 Node 18，切换到 Node 24 后再试，不要重装依赖。
- npm 直接依赖、`package-lock.json`、`save-exact=true`、`allowScripts` 中的 esbuild 授权、PostgreSQL 镜像、Playwright/Chromium 和 Dockerfile frontend 继续使用已确认的精确版本；不得把 Node/npm 运行时的 major-only 政策扩展到这些软件。
- 若终端未加载版本管理器，请先将当前运行时切换到任意 Node 24.x 与 npm 11.x，再执行项目命令。
- Docker 在本机开发与测试中只允许承载 PostgreSQL。migration、seed、build、API 应用、Vitest、Node Test、Playwright 和 Chromium 全部运行在宿主机；不得使用 Docker 构建或运行本机测试应用。
- `npm run instance -- up|status|down|destroy --yes` 只管理当前 worktree 的 `dev` PostgreSQL。完整验证和 standalone Playwright 分别使用同一 worktree 下独立的 `verify`、`playwright` Compose project、容器、网络和卷；PostgreSQL 宿主机端口由 Docker 动态分配，不得恢复固定 `54329`。
- 本机应用固定绑定 `127.0.0.1` 并以 `PORT=0` 由操作系统动态分配端口；不得占用永久部署的 `127.0.0.1:3000`，也不得恢复固定 `3100`。
- `npm run verify` 在宿主机执行格式、lint、类型、注释、架构、构建、单元、API、PostgreSQL 契约、Playwright 行为和视觉检查。它只启动 `verify` PostgreSQL，不执行或模拟永久 Docker 部署；成功删除验证数据库容器、网络和卷，失败保留数据库现场，但宿主机应用进程始终停止。
- `npm run verify -- --final` 仅用于 clean、已提交且验证期间 HEAD 不变的候选提交；成功后创建本地 `refs/noticeboard/verified/<sha>`，供 primary `main` 的 release 校验。worktree 最终验证不得调用部署入口。
- 永久部署只能在 Git primary checkout 的 clean `main` 分支执行 `npm run deploy`，固定使用 Compose project `noticeboard` 和应用端口 `127.0.0.1:3000`，PostgreSQL 不发布宿主机端口。部署命令只允许 `up -d --build --wait` 式升级，不得添加任何删除路径；完成后必须通过 readiness、首页、OpenAPI 和数据库只读 API smoke。
- 标准发布使用 `npm run release -- <候选> --expect-sha=<sha> --confirm-auto-revert`：要求候选已有 final verified ref，在本地 `main` 创建 no-ff merge commit 后立即部署验证。部署失败时只撤回本次 merge commit并尝试一次补偿部署；不得自动 fetch、push、reset、force push、删除分支或执行数据库 migration revert。补偿仍失败时停止自动操作并转人工恢复。
- 永久部署只设置上海业务时区，不得设置日期覆盖；测试编排固定注入 `TASK_BUSINESS_TIME_ZONE=Asia/Shanghai` 和 `TASK_CURRENT_DATE_OVERRIDE=2026-09-01`。
- 若出现 Docker socket `permission denied` 或连接 localhost 动态端口时出现 `EPERM`，这是执行环境没有 Docker socket或本机端口权限，不是应用故障。切换到允许访问 Docker 与本机测试端口的终端/执行环境后，重跑原命令；在受限代理环境中按其权限流程申请放行。

## 编码与注释

- 使用 Node 24.x、npm 11.x、strict TypeScript、两空格缩进、单引号和精确依赖版本。
- 所有手写代码文件以职责/层级注释开头。顶层具名函数、类方法、构造器、迁移方法、导出可调用对象和测试用例使用说明约束、副作用或意图的 TSDoc/JSDoc；简单内联 callback、映射、生成物、JSON、lockfile 和编译产物豁免。
- 前端用户内容只通过 `textContent` 或安全节点工厂写入 DOM。
- 保持现有中文文案、hash、HTML 节点顺序、class、DOM/ARIA 与十主题顺序/令牌，除非需求明确改变并更新行为/视觉基线。
- Product Design 生成的图片必须在生成后复制到当前仓库内的 `design-concepts/` 目录，并按功能或方案使用稳定文件名；交付时报告项目内相对路径。不要只引用 Codex 外部缓存目录中的生成图片路径。
- 保留工作区无关修改；不要用破坏性 Git 或文件命令。

## 测试与交付

- Git 提交日志必须使用中文书写。
- 领域/前端规则进单元测试；PostgreSQL 语义进仓储契约；HTTP/DTO/guard/OpenAPI/健康进 API 测试；跨页面交互进 Playwright 行为测试；外观进零像素视觉测试。
- 视觉验证只检查“瑞士国际”主题；其桌面端与移动端截图作为唯一视觉基准。其他主题按类似于 Mod 的定位处理，不纳入视觉回归截图检查，但仍须通过主题注册、令牌、类型与行为质量检查。
- 主题契约见 `style-configs/README.md`，架构决策见 `docs/architecture.md`，运行方式见 `README.md`。
- 项目完整验证命令为 `npm run verify`，并执行 `git diff --check`。最终候选额外使用 `npm run verify -- --final`；永久部署验证只能在候选合并回 primary `main` 后由 release 流程立即执行。
