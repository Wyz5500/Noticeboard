# Feature Boundary Hardening 设计

## 目标

Noticeboard 后端继续保持模块化单体。`tasks`、`identity`、`authorization`、`health` 是一级 Feature 边界，Domain / Application / Presentation / Infrastructure 是各 Feature 内部的二级边界。一个 Feature 只能通过另一个 Feature 的 `public/` 合同使用其能力，不能直接导入其内部层级。

本次只强化静态边界和现有组装方式，不引入插件系统、事件总线、微服务、通用仓储或全局事务上下文。

## Public contract

每个 Feature 建立明确的 `public/` 目录。公共文件直接定义稳定合同，不使用 barrel 将内部文件重新导出。

- `identity/public` 提供 Actor 类型、身份查询 port/token、声明身份要求的 Nest decorator，以及 IdentityModule。
- `authorization/public` 提供 permission code/catalog、授权 port/token、声明权限要求的 Nest decorator，以及 AuthorizationModule。
- `tasks/public` 与 `health/public` 提供各自的 Nest Module 入口。
- Guard 类仍在各 Feature 的 presentation 内部。公共 decorator 在所属 Feature 内部引用 Guard；消费者只声明身份或权限需求，不知道 Guard 实现。
- Nest Module 可以导出内部 Guard provider 供 Nest 在导入模块中解析，但不会从 TypeScript public API 导出 Guard 类。

identity 拥有 Actor 类型和 Account ORM 映射；authorization 拥有 Role / RolePermission ORM 映射；tasks 拥有 Task / TaskEvent ORM 映射。

## 跨 Feature 持久化协作

Feature-specific ORM entity 不移动到 `common`，也不从 public API 直接重新导出。确实需要共享同一 PostgreSQL 事务的基础设施协作通过窄的、用途明确的 public persistence contract 完成。

authorization 的账户管理仍负责角色与权限不变量，但通过 identity 提供的账户持久化协作端口读取和保存 Account。该端口只供 Infrastructure 使用，允许显式接收当前 `EntityManager`，从而继续共享现有事务和 advisory lock；Application 不会看到 TypeORM 类型。

TypeORM 跨 Feature relation 使用 public persistence relation contract 中的稳定 entity target token 和最小结构类型，不导入其他 Feature 的实体类。实际实体构造器只通过 Composition Root 注册入口暴露给顶层组装代码。

## Composition Root

全局 DataSource options、migration 注册和部署 seed 编排移到 `apps/api/src` 顶层。顶层文件负责收集各 Feature 的 `public/composition/` 入口：

- persistence entity 注册；
- Feature-owned seed 操作；
- Nest Module 组装。

`public/composition/` 是受限入口，只允许 API 顶层 Composition Root 导入，其他 Feature 即使位于 `public/` 也不能依赖它。入口通过函数或只读集合提供注册值，不重新导出内部实体类。

demo HTTP 职责拆分：identity 拥有用户列表端点，tasks 拥有任务 reset 端点，避免 identity presentation 反向编排 tasks。

## Checker 规则

checker 根据 `apps/api/src/<first-segment>/...` 自动识别 Feature；`common`、顶层文件和顶层 layer 目录不是 Feature。规则不列举现有 Feature 名称，因此未来新增 Feature 自动生效。

- Feature A 导入 Feature B 时，target 必须位于 B 的 `public/`。
- Feature 不能导入其他 Feature 的 `public/composition/`。
- `common` 不能反向导入任何 Feature；Feature 可以依赖 common。
- 只有 `apps/api/src` 的直接顶层文件可以作为 Composition Root 导入 `public/composition/` 或必要的 Feature persistence composition entry。
- public 文件不得通过 `export ... from` 重新导出本 Feature 内部目录。
- type-only import 与 value import 同样受 Feature Boundary 检查。
- 原有 layer、framework isolation、SQL leakage、generic abstraction 与 import cycle 检查保持有效。

每条 Feature Boundary 错误包含稳定 rule id、importer 和 target，CLI 继续以非零状态退出。

## TDD 与验证

先使用通用 `feature-a` / `feature-b` fixture 运行真实 checker，确认以下违规在当前实现下错误地通过：

- presentation → 另一 Feature presentation；
- infrastructure → 另一 Feature infrastructure；
- application → 另一 Feature application internal implementation。

允许 fixture 覆盖另一 Feature public contract、同 Feature 合法分层、Feature → common，以及顶层 Composition Root → composition entry。回归 fixture 保证原有逆向 layer 依赖仍失败，并覆盖 public re-export 和非顶层代码滥用 composition entry。

实现后依次运行架构测试、architecture checker、单元/API/contract 等针对性检查，最终在 Node 24.20.0、npm 11.19.1 和项目 PostgreSQL 前置条件下执行完整 `npm run verify`。只有完整门禁退出码为零才报告完成。
