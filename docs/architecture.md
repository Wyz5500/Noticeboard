# 架构决策

## 运行形态

系统是一个模块化单体：唯一的 NestJS + Fastify 进程同时提供 `/api/v1`、健康检查、OpenAPI 和 `dist/web` 静态页面。应用实例无状态，PostgreSQL 18.6 是任务与时间线的权威数据源。第一版不包含 SQLite、Redis、CQRS、Outbox、Event Sourcing、Helm 或正式认证。

```text
原生 TypeScript 页面 ── REST / OpenAPI ── NestJS 表现层
                                             │
                                      应用用例与端口
                                             │
                                       纯领域聚合
                                             │
                           TypeORM Data Mapper / PostgreSQL
```

## 模块与依赖方向

`tasks`、`identity`、`authorization`、`health` 是功能模块。业务模块内部遵循：

- Domain：纯 TypeScript 的聚合、值和规则；不依赖框架或基础设施。
- Application：协调用例与事务；只依赖领域和窄端口。允许有限 Nest DI，但当前用例保持普通类。
- Presentation：控制器、DTO 校验、demo guard、OpenAPI 和统一 HTTP 错误映射。
- Infrastructure：TypeORM 实体、映射器、查询、仓储、迁移、seed、日志和运行配置。

DTO、领域 `Task`、读取投影与 ORM 实体分别建模。ORM 实体不会从控制器返回。`scripts/check-architecture.ts` 检查循环、逆向层依赖、核心层框架泄漏和通用仓储/服务基类。

## 用例、查询与事务

写用例为 `CreateTask`、`ActOnTask`、`ResetDemoTasks`；读用例为 `ListTasks`、`GetTask`、`ListDemoActors`、`GetAdminOverview`。列表与统计是真实只读需求，因此通过 `TaskQueryPort` 返回投影；领域恢复和写入通过聚合语义的 `TaskRepositoryPort`。授权通过 `AuthorizationPort` 窄端口提供有效权限判断，角色和用户管理通过专用管理端口执行显式事务。

应用层用 `TaskTransactionPort.run(callback)` 明确决定写事务边界。该回调只获得当前任务用例所需的仓储能力，不暴露 `EntityManager`、`QueryRunner`、通用 `UnitOfWork` 或隐式全局事务。动作保存执行带预期版本的条件更新；零影响行映射为 409。任务版本更新与新增时间线事件使用同一底层 PostgreSQL 事务。

## 数据与契约

迁移创建 `accounts`、`roles`、`role_permissions`、`tasks`、`task_events`，用外键、活跃角色名称唯一索引、每任务事件顺序主键、创建时间排序索引和乐观版本列保护数据。账户与角色只做逻辑删除；任务事件保存操作人的角色名称快照。生产配置永久使用 `synchronize: false`。部署 seed 幂等写入独立管理员和三个演示身份，只在任务表为空时于单一事务中初始化十二项任务；显式 reset 才替换任务数据。

HTTP 使用 URI 版本 `/api/v1`。稳定枚举、字段、状态码与 demo-only 身份头以 `/api/openapi.json` 为唯一字段契约；本文不复制 DTO 字段以避免双重真相。未来正式认证只替换身份适配器。

## 前端边界

页面启动时读取活跃身份和当前用户可见的全部任务，随后在内存执行 hash 路由、范围、状态、搜索和统计。拥有 `system.manage` 的身份还可进入 `#admin` 管理视图，管理操作成功后重新读取总览。命令成功后重新读取任务；网络失败和乐观冲突沿用 toast/表单错误语言并重新同步。`RequestGate` 阻止同一命令重复提交。用户内容只经 `textContent` 或安全节点工厂进入 DOM。

十套主题是完整的类型化令牌配置。批量注册先验证后提交，失败不会留下半注册状态。主题值和注册顺序来自旧原型；视觉测试直接使用迁移前冻结的 PNG，要求 `maxDiffPixels: 0`。

## 运行与部署

配置仅来自环境变量，并在启动时验证。PostgreSQL 连接、查询和 readiness 探测都有明确超时，意外异常在返回安全错误信封前写入结构化日志。镜像用固定 Node 24.20.0 多阶段构建，生产层只安装运行依赖并以 `node` 用户启动；Compose 的应用文件系统只读。migration 和非破坏性 seed 是先于无状态应用的一次性服务。存活检查不依赖数据库，就绪检查实际执行 PostgreSQL 查询。
