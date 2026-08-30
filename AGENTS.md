# 仓库指南

## 项目结构与模块组织

这是一个零依赖的浏览器原型。浏览器是唯一运行环境；没有包管理器、构建步骤、后端或框架。

- `index.html` — 页面结构、导航、任务面板、身份切换器、详情抽屉和创建任务弹窗。
- `app.js` — DOM 渲染、哈希路由同步、表单处理、风格选择和用户交互。
- `app-state.js` — 任务模型、演示用户、权限、状态转换、时间线事件、路由辅助函数、筛选和任务 `localStorage` 持久化。
- `style-preferences.js` — 视觉风格注册、令牌校验、风格偏好持久化和 CSS 自定义属性应用。
- `style-configs/*.js` — 每个文件包含一套完整的视觉风格配置。新增风格前请先阅读 `style-configs/README.md`。
- `styles.css` — 共享布局、组件样式、响应式规则、无障碍状态和风格专属装饰规则。
- `tests/state.test.js` — 状态机、权限、路由、筛选和任务持久化测试。
- `tests/style.test.js` — 风格注册、令牌契约、持久化、页面接线和主题 CSS 测试。
- `README.md` — 面向用户的启动、行为、存储和验证说明。

将领域行为保留在 `app-state.js`，将 DOM 相关逻辑保留在 `app.js`。将视觉偏好行为保留在 `style-preferences.js`，将主题值保留在 `style-configs/`。除非同步更新本指南和 README，否则不要添加后端、框架、包管理器或网络字体依赖。

## 目标 Node.js 后端架构与长期约束

当前仓库仍是零依赖的浏览器单页原型，未来 Node.js 后端迁移尚未开始。本节记录后端开始建设后的强制架构规则；在迁移完成前，不应为了“预留”后端而添加后端项目、工具链或运行时依赖。当前原型的启动、测试、浏览器环境和 `localStorage` 行为继续遵循本文件其余章节。

### 技术基线与模块边界

后端目标技术基线如下：

- `Node.js 24.x LTS`。开始迁移后再固定具体 patch 版本。
- TypeScript strict（严格模式）。
- NestJS + Fastify。
- REST + OpenAPI 3。
- 模块化单体（Modular Monolith），以功能模块（Feature Module）组织业务模块。
- `Domain / Application / Presentation / Infrastructure` 四层和端口与适配器（Ports & Adapters）。
- TypeORM 数据映射模式（Data Mapper）。
- PostgreSQL。
- Docker。

每个功能模块应在上述边界内组织自己的业务能力，模块之间通过明确的应用能力、领域类型或端口协作，不以数据库表或 ORM 实体作为模块公共边界。

依赖方向和职责必须保持如下约束：

- 领域层（Domain）是纯 TypeScript，只包含核心业务规则和模型。领域层禁止依赖 NestJS、TypeORM、Fastify、HTTP、PostgreSQL、直接 SQL 或其他基础设施实现；领域层不得包含 TypeORM 装饰器（Decorator）。
- 应用层（Application）负责业务用例协调，可以有限使用 NestJS 依赖注入（DI）的 `@Injectable()`、`@Inject()` 等能力，但只能依赖领域层与端口。应用层禁止依赖 TypeORM、ORM 实体、`EntityManager`、`QueryRunner`、HTTP、`FastifyRequest` 或直接 SQL。
- 表现层（Presentation）负责控制器（Controller）、数据传输对象（DTO）、校验（Validation）、守卫（Guard）、OpenAPI 描述和 HTTP 错误映射，不把 HTTP 细节泄漏到领域层或应用层。
- 基础设施层（Infrastructure）负责 TypeORM、PostgreSQL、迁移（Migration）、仓储（Repository）、查询（Query）和事务适配器（Transaction Adapter），并隔离数据库及其他外部服务的实现细节。

### 仓储、查询端口与模型分离

- 仓储（Repository）必须围绕业务聚合和业务语义设计，不能按表或按 CRUD 模板机械生成。
- 禁止建立 `GenericRepository<T>`、`BaseRepository<T>` 或 `BaseService<T>` 作为跨模块通用抽象。
- 核心聚合的持久化通过仓储端口（Repository Port）完成；应用层依赖端口，不依赖具体适配器（Adapter）。
- 查询端口（Query Port）只在真实出现列表、搜索、筛选、统计、报表或其他复杂只读需求时建立，不要求每个模块预先创建空接口。
- 查询端口可以返回读取模型（Read Model）或投影（Projection），不要求查询经过完整领域实体（Domain Entity）。

对于 `Task`、`Workspace`、`Membership`、`Account`、`Project` 等核心可变业务对象，API 数据传输对象（DTO）、领域模型（Domain Model）、ORM 实体（ORM Entity）必须分离。查询读取模型（Query Read Model）、只读投影（Projection）、简单字典、技术记录和统计结果可以使用更轻量的数据结构。TypeORM 实体不得直接成为公共 API 契约（API Contract）；API 契约不得由数据库模式直接决定。

### 数据库、迁移与契约测试

- PostgreSQL 是第一版基准数据库。
- TypeORM 只能位于基础设施层，并使用数据映射模式；生产环境禁止 `synchronize: true`。
- 数据库模式变更统一使用迁移，不通过启动时自动同步完成。
- PostgreSQL 专属 SQL、类型和能力必须隔离在基础设施层。
- PostgreSQL 与未来 SQLite 可以拥有独立迁移，不要求迁移文件跨数据库直接复用。
- 第一版不实现 SQLite 适配器；未来桌面离线需求明确后，SQLite 只能作为通过基础设施适配器接入的本地持久化机制。

第一版建立可复用的仓储契约测试（Repository Contract Test），但只运行 PostgreSQL 适配器。契约测试验证仓储端口承诺的共同业务语义，不要求不同数据库的底层行为完全一致。未来 SQLite 适配器应直接复用同一套契约测试；锁、隔离级别、JSON、全文检索、索引和 SQL 方言等数据库特有行为，使用各自专属测试覆盖。

### 事务边界

- 应用层决定事务边界，领域层不感知事务。
- 应用层不得接触 TypeORM `EntityManager` 或 `QueryRunner`。
- 同一事务中的所有持久化操作必须共享同一个底层数据库事务。
- 事务端口（Transaction Port）只暴露当前业务用例真正需要的仓储或能力（Capability）。
- 禁止包含所有仓储的全局事务上下文（TransactionContext）或服务定位器（Service Locator）。
- `TransactionContext` / `UnitOfWork` 的具体接口形状必须围绕真实业务用例设计；文档中的接口（如有）仅作示意，不属于冻结 API。
- 第一版优先使用显式事务上下文，不使用 `AsyncLocalStorage` 隐式管理事务。

### 部署与运行边界

- 服务器版以及 Docker/Kubernetes 部署的应用实例必须保持无状态。
- PostgreSQL 等服务器持久化状态位于应用实例之外；容器内不得保存服务器业务持久化状态。
- 桌面离线版可以使用本地 SQLite 等持久化机制，但仍必须通过基础设施适配器访问，不受服务器无状态要求限制。
- 配置通过环境变量提供。
- 后端提供健康检查、就绪检查、结构化日志和优雅关闭（Graceful Shutdown）。
- 第一版满足 Kubernetes 就绪要求，但不添加 Helm 或集群部署文件。

### 第一版范围与迁移边界

第一版必须建立模块边界、TypeScript strict（严格模式）、仓储端口、事务端口、迁移、PostgreSQL 适配器、契约测试框架、API 版本、OpenAPI、DTO 校验、架构检查和 Docker 基础约束。查询端口按实际查询需求建立，不预先创建空接口。

第一版暂不建立完整 SQLite 适配器、微服务、CQRS、Redis、Outbox、Event Sourcing、Helm 或通用基类，也不在当前浏览器原型中提前创建这些后端文件。

迁移时，识别并优先提取 `app-state.js` 中与浏览器环境无关的任务状态机、权限判断和核心业务规则，并迁移为纯 TypeScript 领域层/应用层逻辑。`app-state.js` 中的 `localStorage`、原型状态管理和浏览器环境适配不应自动进入领域层/应用层。

## 开发与验证命令

项目没有构建步骤。使用以下命令在本地启动原型：

```bash
python3 -m http.server 8000
```

打开 `http://localhost:8000`。在 macOS 上从仓库根目录运行以下命令，执行完整自动化检查：

```bash
osascript -l JavaScript tests/state.test.js
osascript -l JavaScript tests/style.test.js
git diff --check
```

测试命令应分别输出 `state tests passed` 和 `style tests passed`。修改界面或交互后，还应在浏览器中手动检查空列表、长标题、移动端布局、身份切换、风格切换、刷新后的持久化、任务抽屉、创建任务弹窗和 Escape 键关闭。

## 编码风格与命名约定

应用 JavaScript 使用两个空格缩进、分号、单引号、小型具名函数、`var`、函数声明和立即调用函数表达式（IIFE），以保持 ES5 兼容风格。JavaScript 变量和函数使用 `camelCase`，常量使用 `UPPER_SNAKE_CASE`，CSS 类使用 kebab-case。测试文件可以使用 macOS JavaScriptCore 运行器已支持的语法。

将用户提供的文本插入 HTML 前先进行转义。除非明确使用双语标签，界面可见文案使用简体中文。保持 `index.html` 中现有的脚本加载顺序：状态、风格注册、全部风格配置，最后加载应用脚本。

## 状态、权限与存储

所有任务状态变更都必须通过 `app-state.js` 中的权限检查；不要在 DOM 处理器中重复实现权限规则。当前流程为：

`未开始` → `进行中` → `已完成` → `关闭`

从 `已完成` 状态开始，发布者可以验收并关闭任务，或重新打开任务。`重新打开` 的任务可以由任何已知用户再次接取，也可以由发布者直接关闭。任何已知用户都可以发布任务；只有当前接取者可以将进行中的任务标记为完成；只有发布者可以验收、重新打开或关闭自己的任务。

任务状态和当前用户以 JSON 形式存储在 `minecraft-guild-board-state` 下。视觉偏好独立存储在 `minecraft-guild-board-style` 下；缺失或非法的风格 ID 会回退到 `swiss-international`。绝不要在 `localStorage` 中存储凭据、令牌或秘密信息。

“我的任务”范围根据任务时间线中最后一位有效操作人确定，而不只根据 `task.assignee` 确定。如果状态结构发生变化，必须同步更新加载回退逻辑、相关测试和 README 中的存储说明。

## 测试指南

为每个新增的状态转换、权限规则、路由行为、筛选规则、持久化行为、风格令牌和相关边界情况添加测试。测试名称应描述其验证的行为，例如 `publisher approval closes a task`。优先通过 `app-state.js` 或 `style-preferences.js` 直接测试领域行为；仅对现有风格测试已经覆盖的集成契约使用页面和 CSS 字符串断言。交付前运行两个测试文件和 `git diff --check`。

## 文档与变更指南

当用户可见行为、命令、存储键、支持的风格或项目结构发生变化时，更新 `README.md`。当风格配置契约或主题编写约束发生变化时，更新 `style-configs/README.md`。保持本文件与实际模块边界、测试命令和持久化模型一致。

## 提交与拉取请求指南

使用简短的祈使句式提交主题，例如 `Add reopened task flow`。拉取请求应说明用户可见行为，列出验证命令，注明存储或结构变化，并为界面变更附上桌面端和移动端截图。仅修改文档时不要附截图，除非截图能够说明相关行为变化。

## 安全与范围

保留工作区中的无关修改。避免使用破坏性命令和大范围文件操作。将修改限制在请求范围内；未经明确记录和审查，不要引入外部服务或依赖。
