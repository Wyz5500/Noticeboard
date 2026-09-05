# 只读 HTTP SDK 设计

> 历史阶段设计：下文保留当时只读范围，后续 CLI、写操作和独立 SDK 本地包均已实现。当前能力以 `../../sdk.md`、`../../cli.md` 和 `../../architecture.md` 为准。

用户已确认按 README 路线图先交付只读 SDK，并选择完整只读结构校验。实现沿现有 OpenAPI artifact → generated transport → handwritten SDK 方向推进；HTTP 字段、数据库、Web 和生成模板均无需改变。

## 已确认决策

- 唯一公共入口为 `apps/cli/src/sdk/index.ts`，提供工厂、稳定资源/选项类型、三类错误，以及 `tasks.list/get`、`identities.list`。
- 构造时显式注入 base URL、Fetch、同步/异步请求头提供者与默认取消信号；资源方法支持单次取消。实例不读取或持久化配置，不输出日志、不缓存、不重试。
- 完整校验已知字段与嵌套联合，容忍新增字段，仅映射手写类型声明的字段；保持日期字符串、版本、排序和评论投影。
- 错误区分 HTTP API、网络/取消和协议错误；保留服务器 status、开放 code 与错误信封元数据。无效构造参数及提供者失败维持调用方错误语义。
- 独立 typecheck/build/test，输出 ESM 和声明。根 verify 接入 SDK 类型检查；单元、构建/声明合同及真实宿主机 HTTP smoke 使用现有测试体系。
- 不引入 npm 依赖或 workspaces，不实现 CLI、写操作或发布。服务器生产镜像只复制服务器和 Web 产物。

## 验收

先验证公共 SDK 行为测试失败，再实现资源、传输适配和响应校验。测试覆盖全部只读字段、未知字段/错误码、并发隔离、取消、API/网络/协议错误、构建后的纯 Node 调用、公共声明传递依赖和真实 HTTP 请求。完整运行 `npm run verify` 与 `git diff --check`，中文候选提交后运行 `npm run verify -- --final`，不进行服务器或 npm 发布。

当前使用方式和精确公共合同统一见 [`../../sdk.md`](../../sdk.md)，架构事实源见 [`../../architecture.md`](../../architecture.md)。
