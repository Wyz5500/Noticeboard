# 架构决策

## 运行形态

系统是一个模块化单体：唯一的 NestJS + Fastify 进程同时提供版本化 API、健康检查、OpenAPI 和编译后的静态页面。应用实例无状态，PostgreSQL 是服务器任务与时间线的权威数据源。现有架构不包含 SQLite、Redis、CQRS、Outbox、Event Sourcing、Helm 或正式认证。

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

`tasks`、`identity`、`authorization`、`health` 是一级 Feature 边界；Domain / Application / Presentation / Infrastructure 是 Feature 内部的二级边界。一个 Feature 只能导入另一个 Feature 的 `public/` 合同，不能直接访问其领域、用例、控制器、Guard、ORM 实体等内部实现。公共合同保持窄小，只包含实际需要的类型、port/token 和声明式 Nest integration；public 文件不得通过 re-export 将内部实现伪装成公共 API。

业务模块内部遵循：

- Domain：纯 TypeScript 的聚合、值和规则；不依赖框架或基础设施。
- Application：协调用例与事务；只依赖领域和窄端口。可使用有限的依赖注入装配能力，但业务语义不依赖框架运行时。
- Presentation：控制器、DTO 校验、demo guard、OpenAPI 和统一 HTTP 错误映射。
- Infrastructure：TypeORM 实体、映射器、查询、仓储、迁移、seed、日志和运行配置。

分层边界按依赖性质定义，而不是按当前依赖包名单定义。Domain 不得出现框架、传输、持久化、数据库或装饰器依赖；Application 不得依赖 ORM Entity、ORM 运行时对象、HTTP 运行时类型或直接 SQL。核心层通过显式参数和窄端口声明依赖，禁止以服务定位器、全局事务上下文或类似隐式机制取得基础设施能力。通用 Repository/Service 基类会抹平聚合语义和用例边界，因此业务持久化与服务合同必须表达具体能力，不能退化为通用 CRUD 抽象。

DTO、领域模型、读取投影与 ORM 实体分别建模。ORM 实体不会从控制器返回。Feature-specific ORM 映射仍由所属 Feature 管理；需要共享事务的跨 Feature 基础设施协作使用明确的 public persistence contract，不把实体搬入 `common`。

`apps/api/src` 的直接顶层文件是 Composition Root，负责 Nest Module、全局 DataSource、migration 和 seed 组装。只有这些文件可以导入 Feature 的 `public/composition/` 注册入口；普通 Feature、`common` 和嵌套顶层代码不能使用该入口，Composition Root 也不能直接导入 Feature 私有实现。`common` 只能被 Feature 依赖，不能反向依赖任何 Feature。

`scripts/check-architecture.ts` 自动识别任意 `apps/api/src/<feature>/...`，检查 Feature Boundary、Composition Root 例外、循环、逆向层依赖、核心层框架泄漏和通用仓储/服务基类；新增 Feature 无需修改规则名单。

## 用例、查询与事务

写用例由应用层决定显式事务边界，并通过表达聚合语义的 Repository Port 完成状态变更。事务回调只获得当前用例所需的事务内持久化能力，不向应用层暴露 ORM 运行时对象、通用 Unit of Work 或隐式全局事务。读用例通过面向读取需求的 Query Port 返回投影；列表、统计和详情等读取需求不必为了复用写模型而恢复领域聚合。

跨 Feature 授权通过窄公共端口提供有效权限判断；管理类写操作通过专用能力端口和显式事务完成，不能绕过所属 Feature 的规则。并发写入必须带预期版本条件，条件失败视为乐观冲突。任务生命周期操作、评论创建和评论删除共享同一个任务预期版本与事务边界；一次聚合更新与其新增事件必须使用同一底层 PostgreSQL 事务，保持状态、版本和有序事件一致。

## 数据与契约

PostgreSQL 持久化账户、角色与权限关系、任务及有序任务事件。账户具有由稳定账户 ID 派生、暂不可设置的唯一 `username`；任务事件同时保存操作人的显示信息和 username 快照。时间线事件是 append-only 的生命周期操作、评论创建和评论删除联合：删除评论追加删除事件并保留数据库原文，公开读取投影只在原评论位置返回 tombstone，禁止返回已删除正文或原始删除事件。数据完整性由外键、唯一约束、必要索引、事件形态检查和乐观版本列共同维护；账户与角色采用逻辑删除。数据库模式只通过 migration 演进，所有运行环境永久使用 `synchronize: false`。

部署 seed 幂等初始化演示身份，并且只在任务数据为空时于单一事务中初始化演示任务；只有显式 reset 才替换任务数据。seed 与 reset 不读取浏览器状态，也不能绕过 Feature 所属的持久化边界。

HTTP 使用 URI 版本 `/api/v1`。稳定枚举、字段、状态码与 demo-only 身份头以 `/api/openapi.json` 为唯一字段契约；公开任务时间线以判别联合区分生命周期活动和评论，读取适配器必须在进入 HTTP 契约前完成删除脱敏。本文不复制 DTO 字段以避免双重真相。演示身份头、demo 路由、seed 和 reset 只服务演示环境，不构成正式认证或生产安全边界；未来正式认证只替换身份适配器。

## 前端边界

前端按职责分离装配与路由/API、任务行为与渲染、管理行为与渲染、身份偏好和主题系统；入口只负责组合这些能力，不承载业务规则。客户端路由和页面状态共同驱动视图切换；页面启动时读取活跃身份和服务器状态，筛选、搜索和统计等本地读取交互基于内存快照完成。

管理能力由服务器授权结果控制，不能仅依靠客户端界面隐藏。命令执行期间必须阻止同一操作重复提交；成功后重新读取受影响的服务器状态，失败或乐观冲突时保留既有错误反馈，并在服务器状态可能变化时重新同步，避免客户端快照继续作为权威状态。

浏览器只持久化当前演示身份和视觉偏好；任务、评论、评论草稿、权限状态和其他服务器数据不进入浏览器持久化存储，评论草稿仅按身份和任务保存在当前页面内存中。客户端“我的任务”归属只依据生命周期活动，不把评论或评论删除视为任务归属变更。秘密不得写入浏览器存储。用户内容只经 `textContent` 或安全节点工厂进入 DOM，不能通过 HTML 字符串拼接进入页面。

主题使用完整的类型化令牌配置。批量注册先验证后提交，失败不会留下半注册状态。主题值和注册顺序来自旧原型；“瑞士国际”主题的桌面与移动视觉测试直接使用迁移前冻结的 PNG，要求 `maxDiffPixels: 0`。

## 运行与部署

配置仅来自环境变量，并在启动时验证。PostgreSQL 连接、查询和 readiness 探测都有明确超时，意外异常在返回安全错误信封前写入结构化日志。镜像使用多阶段构建，生产层只安装运行依赖并以非 root 用户启动；Compose 的应用文件系统只读。migration 和非破坏性 seed 是先于无状态应用的一次性服务。存活检查不依赖数据库，就绪检查实际执行 PostgreSQL 查询。

永久部署与 worktree 实例是两种隔离拓扑。永久部署只能从 Git 主工作目录通过 `npm run deploy` 升级，固定使用 Compose project `noticeboard` 和应用端口 `127.0.0.1:3000`；其 PostgreSQL 只连接内部网络并使用持久卷，部署入口不提供删除能力。linked worktree 必须拒绝永久部署。

开发、完整验证和独立 Playwright 使用按 worktree 绝对路径派生的 Compose project、网络和数据库卷，宿主机端口由 Docker 动态分配，应用端口必须避开永久部署的 `3000`。独立 Playwright 使用额外的 `-playwright` project，不能回退到固定宿主机端口。生命周期操作以仓库共享锁和 project 锁避免并发修改；不同 worktree 的业务测试可在各自实例上并行。完整验证和独立 Playwright 成功后删除其容器、网络及数据库卷，失败时保留现场，重复相同命令会升级保留实例后重试。worktree 的 `down`、`destroy` 和验证清理只能作用于当前路径派生的 project，不得操作永久 `noticeboard`。

## 架构变更判定

在既有边界内新增普通用例、读取投影、业务表或演示 fixture，不构成架构变化，无需更新本文。改变一级 Feature 拓扑、分层职责或依赖方向、Feature 公共合同、Composition Root 与 `common` 规则、事务及一致性策略、数据持久化原则、认证与安全边界、前端状态与持久化架构、部署拓扑或重大基础设施选型，属于架构变化，必须同步更新本文和相应的可执行验证。
