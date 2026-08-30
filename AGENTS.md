# 仓库贡献规则

## 模块边界

- `apps/api` 按 `tasks`、`identity`、`health` 功能模块组织；业务模块遵守 Domain / Application / Presentation / Infrastructure 依赖方向。
- Domain 必须是纯 TypeScript，禁止 NestJS、TypeORM、Fastify、HTTP、PostgreSQL、SQL 和装饰器。
- Application 只依赖领域与窄端口；禁止 TypeORM、ORM 实体、`EntityManager`、`QueryRunner`、HTTP 类型和直接 SQL。
- Presentation 负责控制器、DTO、校验、守卫、OpenAPI 与 HTTP 错误映射；Infrastructure 隔离 ORM、数据库、迁移、查询、仓储和事务适配器。
- 禁止 `GenericRepository<T>`、`BaseRepository<T>`、`BaseService<T>`、全局事务上下文和服务定位器。DTO、领域模型、读取投影、ORM 实体保持分离。
- `apps/web` 将装配/路由/API、任务行为与渲染、身份偏好、主题分别放在 `core`、`tasks`、`profile`、`styles`。入口仅装配依赖；用户内容只通过 `textContent` 或安全节点工厂写入。

## 数据与运行约束

- PostgreSQL 是服务器任务权威数据源；TypeORM `synchronize` 永远关闭，模式只经 migration 修改。
- 应用层决定显式事务边界；同一事务的聚合更新和事件追加共享底层事务并使用乐观版本条件。
- 服务器实例无状态；配置使用环境变量。不要添加 SQLite、Redis、CQRS、Outbox、Event Sourcing、Helm 或正式认证，除非范围明确改变。
- `X-Demo-User-Id`、demo 路由、seed/reset 均为 demo-only。浏览器只保存当前演示身份和视觉偏好，不保存任务或秘密。
- OpenAPI 是唯一 HTTP 字段契约。改变字段、枚举或状态码时先更新失败测试和 OpenAPI 描述。

## 编码与注释

- 使用固定 Node 24.20.0、npm 11.19.1、strict TypeScript、两空格缩进、单引号和精确依赖版本。
- 所有手写代码文件以职责/层级注释开头。顶层具名函数、类方法、构造器、迁移方法、导出可调用对象和测试用例使用说明约束、副作用或意图的 TSDoc/JSDoc；简单内联 callback、映射、生成物、JSON、lockfile 和编译产物豁免。
- 保持现有中文文案、hash、HTML 节点顺序、class、DOM/ARIA 与十主题顺序/令牌，除非需求明确改变并更新行为/视觉基线。
- 保留工作区无关修改；不要用破坏性 Git 或文件命令。

## 测试与交付

- Git 提交日志必须使用中文书写。
- 遵循测试驱动：先写会失败的最小测试，再实现，再重构。
- 领域/前端规则进单元测试；PostgreSQL 语义进仓储契约；HTTP/DTO/guard/OpenAPI/健康进 API 测试；跨页面交互进 Playwright 行为测试；外观进零像素视觉测试。
- 主题契约见 `style-configs/README.md`，架构决策见 `docs/architecture.md`，运行方式见 `README.md`。
- 交付前运行 `npm run verify`。它依次检查格式、lint、类型、注释、架构、单元/API/PostgreSQL/行为/视觉测试，并执行 `git diff --check`。
