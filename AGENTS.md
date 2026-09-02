# 仓库贡献规则

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

- 项目固定使用 Node `24.20.0` 与 npm `11.19.1`。运行测试前先检查 `node --version` 和 `npm --version`；如果出现 `node:util` 缺少 `styleText` 的 Vitest/Rolldown 启动错误，通常是误用了 Node 18，切换到 Node 24 后再试，不要重装依赖。
- 若终端未加载版本管理器，请先将当前运行时切换到 Node `24.20.0`，再执行 `npm run verify`。
- 仓库标准运行与完整验证统一通过 `npm run instance -- ...` 管理，支持 `up`、`status`、`down`、`destroy` 和 `verify`；`npm run verify` 委托给当前 worktree 的 `instance -- verify`。每个 worktree 使用独立的 Compose project、PostgreSQL 容器、网络和卷，应用与数据库宿主机端口由 Docker 动态分配；不要预先手工启动共享的普通 `docker compose` 栈，也不要假设固定端口。
- instance verify 会自动向测试注入当前实例的 `DATABASE_URL_TEST` 和 `E2E_BASE_URL`。单独运行 Playwright 时仍支持 standalone 模式：没有 `E2E_BASE_URL` 时会在 `127.0.0.1:3100` 启动应用；未显式提供 `DATABASE_URL_TEST` 时才回退到 `127.0.0.1:54329` 测试数据库。该回退不是仓库标准运行模型。
- 若出现 Docker socket `permission denied`（例如 OrbStack 的 `docker.sock`）或连接 localhost 动态端口时出现 `EPERM`，这是执行环境没有 Docker socket 或本机端口权限，不是应用故障。切换到允许访问 Docker 与本机测试端口的终端/执行环境后，重跑原命令；在受限代理环境中按其权限流程申请放行。

## 编码与注释

- 使用固定 Node 24.20.0、npm 11.19.1、strict TypeScript、两空格缩进、单引号和精确依赖版本。
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
- 项目完整验证命令为 `npm run verify`，依次检查格式、lint、类型、注释、架构、实例生命周期、单元、API、PostgreSQL 契约、Playwright 行为和视觉测试，并执行 `git diff --check`。
