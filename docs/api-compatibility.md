# API v1 兼容政策

> **实施状态：基础治理已落地。** 当前 HTTP API、运行时 `/api/openapi.json`、tracked `openapi/v1/noticeboard.openapi.json`、稳定 operationId、服务端漂移检查、runtime 等价测试和显式受支持基线兼容比较均已存在。internal generated Fetch transport、artifact → generated drift、手写 SDK 和 CLI 的读取及任务/评论写操作已实现；registry 发布仍是目标状态。

## 目标

`/api/v1` 是 Web、CLI、未来 TUI 与 HTTP SDK 的唯一跨进程业务能力边界。兼容治理必须让不同版本的客户端可以在明确窗口内可靠消费服务器，而不依赖 API Feature 内部实现、Nest DTO 类名、ORM Entity 或数据库结构。

OpenAPI 是 HTTP 字段合同的唯一事实源。服务端 controller、DTO 和 Nest metadata 是 authoring source；由真实应用模块确定性生成并提交的 v1 artifact 是审查、codegen、兼容比较和客户端发布构建的唯一输入。不得再手工维护一套平行 YAML/JSON。

## 合同范围

API v1 public contract 包括：

- 路径、HTTP method、URI version 和 query/path/header 参数。
- 请求与响应字段、类型、格式、requiredness、默认值和校验约束。
- 成功与失败状态码。
- 枚举和判别联合。
- 统一错误信封及既有 `error.code` 的语义。
- `X-Demo-User-Id` 的 demo-only 请求语义。
- 列表默认排序、资源归属和乐观并发行为。
- 评论时间线的折叠与删除脱敏。

未版本化的 `/health/live` 与 `/health/ready` 属于运维表面，不是客户端 API v1 contract，也不进入 tracked artifact 或运行时 `/api/openapi.json`。

以下实现名称本身不是外部合同：

- controller、DTO、Application use case、Domain class 或 ORM Entity 的 TypeScript 名称。
- Feature `public/` 中的内部合同。
- generated transport 的文件名和生成器符号。
- PostgreSQL 表、列、索引和 migration 名称。

稳定 `operationId` 是 OpenAPI/codegen 合同，但手写 SDK 必须再提供独立 façade，不能把 generated operation 名直接作为永久 SDK public API。

## Artifact 生命周期

当前 tracked candidate artifact 路径包含 HTTP major：

```text
openapi/v1/noticeboard.openapi.json
```

仍受支持的兼容快照按 OpenAPI SemVer 显式提交到：

```text
openapi/v1/baselines/<semver>.openapi.json
```

candidate 是 codegen 的唯一输入；baseline 只用于兼容比较。一旦某个 baseline 代表已支持或已发布的合同，就不得原地改写或删除，只能在结束相应支持窗口后通过明确评审移除。

生成流程必须：

1. 使用真实 Nest AppModule 的 controller 和 DTO graph。
2. 复用运行时全局 prefix、URI versioning、validation 与 OpenAPI 配置。
3. 固定 title、description、OpenAPI `info.version`、security scheme 和 operationId。
4. 删除构建时间、动态主机、临时端口或环境专属 server URL。
5. 确定性排序、缩进和换行。
6. 关闭 Nest、数据库连接和其他资源。

tracked artifact 不得手工编辑。需要改变 HTTP 契约时，应先更新失败的 HTTP/OpenAPI 测试和服务端 authoring source，再使用 `npm run openapi:generate` 重新生成 artifact。该命令先通过 tsc 编译真实 API graph，以保留 Nest decorator metadata；`npm run openapi:check` 从同一 graph 重建并执行字节比较。两个命令都需要可用的 `DATABASE_URL`，完整 `npm run verify` 会使用隔离的 verify PostgreSQL 自动注入。

### 漂移检查

验证区分三种漂移：

- **服务端 → artifact drift（当前已实现）**：`npm run openapi:check` 从当前服务端重新生成后，结果必须与 tracked artifact 字节一致。
- **runtime drift（当前已实现）**：真实 `AppModule` 的运行时 `/api/openapi.json` 必须与 tracked artifact 语义一致。
- **artifact → generated drift（当前已实现）**：`npm run client:check` 使用 `orval@8.28.1` 从 tracked candidate 重建 `apps/cli/src/sdk/internal/generated/`，比较完整相对文件集合与原始字节，分别报告 missing/changed/stale。检查不写入 tracked tree，已纳入完整 `verify`。

`npm run client:generate` 先生成临时树，再替换整个 tracked generated 目录；受控替换失败恢复旧树，恢复失败保留备份并报告路径，不承诺进程崩溃时的原子目录事务。生成器不读取 baseline 或服务端源码，不启用 mutator、输入转换、生成后 patch 或格式化。Orval 通过 `scripts/openapi-fetch-client.ts` 的 client 扩展直接生成 native Fetch 与注入式 `fetchFn`；请求头由原生 `Headers` 复制并在缺少 Content-Type 时补默认值，避免大小写合并产生 HTTP 415。模板对尚未支持的 query、非 JSON 等 wire 形态失败关闭，base URL 由调用方闭包绑定，身份/取消信号由 `RequestInit` 注入；手写 SDK façade 已实现读写操作并作为 CLI 唯一 HTTP 调用入口。

Generated transport 是生成物：

- 不允许手工修改。
- 不要求添加手写职责注释或 callable TSDoc。
- 仍必须通过 TypeScript 编译和包边界检查。
- 格式/注释门禁应显式识别 generated 路径，而不是在生成文件中加入人工补丁。

## 首个 v1 基线

首个静态 v1 artifact 已在消除管理员 restore 状态码缝隙后建立：

- 用户 restore 与角色 restore 恢复既有资源，不创建新资源。
- 规范成功状态码为 HTTP 200。
- Controller 运行时、OpenAPI 注解和真实集成测试统一为 200。

首个受支持快照固定为 `openapi/v1/baselines/1.0.0.openapi.json`。`npm run openapi:compatibility` 将工作区 candidate 与 baseline 目录中的全部显式快照比较；目录不存在或没有符合 `<semver>.openapi.json` 命名的文件时失败关闭。该命令不读取 Git 历史、不 fetch，也不依赖远端分支，因此 shallow checkout 不会静默漏检，未发布功能分支的中间 artifact 也不会自动成为永久基线。后续任何 v1 变化都必须经过 artifact diff、结构兼容检查和人工语义审查。

## 四类版本

| 版本                   | 管理对象                 | 主要 breaking change                     |
| ---------------------- | ------------------------ | ---------------------------------------- |
| URI `/api/v1`          | HTTP wire contract major | 路径、字段、状态码、错误或默认语义不兼容 |
| OpenAPI `info.version` | v1 契约自身 SemVer       | 契约新增、修复或不兼容变更               |
| SDK package version    | SDK public exports       | 类、方法、参数、类型或错误 API 不兼容    |
| CLI package version    | 命令行 public contract   | 命令、参数、配置、JSON、流或退出码不兼容 |

这些版本不机械同步。例如，API v1 新增兼容 endpoint 可提升 OpenAPI minor；SDK 暂未暴露时无需同步发布 CLI；SDK façade 的不兼容重命名需要 SDK major，即使仍访问 `/api/v1`。

## v1 兼容变更

以下变化通常可以在 v1 中兼容演进，但仍需测试和 artifact 更新：

- 新增 endpoint。
- 新增可选响应字段。
- 新增可选请求字段，且服务器在缺少字段时保持旧行为。
- 新增可选查询参数，且不传参数时保持原响应和默认排序。
- 扩展描述、示例或非规范性文档。
- 新增不影响既有客户端的错误 details 字段。

兼容不等于无需发布说明。客户端生成类型、人工文档和 SDK façade 仍需按各自 SemVer 决定是否发布。

## v1 breaking change

以下变化不得静默进入 v1，必须使用新 HTTP major 或经过明确 deprecation 与迁移窗口：

- 删除、重命名或移动 endpoint。
- 删除或重命名请求/响应字段。
- 修改字段类型、format 或判别字段。
- 新增必填参数或必填请求体，把可选请求字段改为必填，或把既有必填响应字段改为可选。
- 新增或改变全局/operation 安全要求，或改变既有 security scheme。
- 新增 `pattern`、`nullable`、`additionalProperties`、`uniqueItems` 等 schema 限定，或收紧长度、日期、格式和数值范围。
- 修改既有成功状态码。
- 改变错误信封结构，或改变既有 `error.code` 的状态码与语义。
- 改变 `X-Demo-User-Id` 的既有处理方式，而未提供替代迁移路径。
- 改变默认排序、任务归属、有效状态或时间线折叠语义。
- 把数组响应替换成分页对象。
- 把原本允许的请求变为拒绝，或改变写操作的幂等/并发含义。

### 枚举

在 SDK 与客户端尚未具备开放枚举和 unknown fallback 设计前，新增枚举成员按潜在 breaking change 处理。旧客户端可能使用闭合 TypeScript union 或穷尽分支，无法安全处理新值。

若未来需要开放枚举，必须同时定义：

- generated transport 如何保留未知字符串。
- 手写 SDK public type 如何表达 unknown。
- CLI 人类输出和 JSON 如何展示未知值。
- Web 冻结客户端如何降级。

### 分页

当前 `/api/v1/tasks` 默认返回完整任务数组。未来分页不能直接改为：

```json
{
  "items": [],
  "page": {}
}
```

兼容路径只能是：

- 在 v1 新增可选查询能力，同时保持无参数请求的原数组形状；或
- 在新的 HTTP major 中采用分页对象。

默认排序同样属于合同；即使字段形状不变，改变默认顺序也需要按 breaking change 审查。

### 错误码

统一错误信封当前包括：

```json
{
  "error": {
    "code": "...",
    "message": "...",
    "details": {}
  },
  "path": "/api/v1/...",
  "timestamp": "..."
}
```

`error.code` 对客户端是开放字符串：服务器可以为新 endpoint 或新失败场景增加新 code，但不能复用既有 code 表达不同语义。客户端必须能透传未知 code；不得仅因生成类型未枚举新 code 就把合法错误响应判为协议损坏。

中文 `message` 是安全的人类反馈，不是脚本判断依据。自动化应使用 HTTP status、`error.code`、CLI exit code 和结构化 details。

## Deprecation 与 major 迁移

需要替换 v1 合同时：

1. 先提供可并存的新 endpoint、字段或 HTTP major。
2. 在 OpenAPI 中标记 deprecated，并在文档中写清替代路径。
3. 保留一个明确、可验证的迁移窗口。
4. Web、SDK、CLI 和未来 TUI 分别完成迁移，不假定共享源码就等于自动兼容。Web 仍是受支持客户端，因此 maintenance-only 规则明确允许迁移到新受支持 HTTP major 所需的最小兼容修改，但不得借此新增产品功能、改用新 SDK 或进行与迁移无关的重构。
5. 只有在所有仍受支持的客户端完成迁移后，才可按发布方案删除旧合同；不得仅因 Web 已冻结功能开发就跳过其迁移或让它继续请求已删除的 API major。

正式认证未来替代 demo header 时，也应按该流程处理。架构目前只预留 SDK 认证注入边界，不提前决定 JWT、session、OAuth 或 token 生命周期。

## 消费者职责

### Web

Web 处于 maintenance-only，继续使用现有手写 `ApiClient` 和 HTTP 类型，不迁移 SDK。它仍是受支持的独立 API 消费者：允许为当前或未来受支持 HTTP major 进行最小必要的兼容与迁移修改，但不得新增 Web 产品功能或借机重构无关客户端代码。现有 HTTP、Playwright 行为和视觉测试继续参与兼容验证。

### SDK 与 CLI

Generated transport 只消费 tracked artifact；手写 SDK 隔离生成器实现并提供稳定资源 façade；CLI 只消费 SDK public API。CLI 的 `--json`、配置和退出码由 CLI SemVer 管理，不直接等同于 OpenAPI schema。

### Future TUI

TUI 与 CLI 平级，只依赖 SDK public API。不得导入 CLI command、renderer、配置内部实现或 generated transport；需要共享 profile 时，应依赖未来明确的客户端配置公共合同，而不是跨 app 私有 import。

## 验证职责

HTTP/OpenAPI 变化至少需要：

- 先更新失败的 HTTP/DTO/guard/OpenAPI 测试。
- 生成并审查 tracked artifact diff。
- 运行 artifact drift、runtime equivalence 与 generated drift；candidate 更新后必须运行 `npm run client:generate`。
- 运行 v1 compatibility 检查，并人工审查工具无法判断的错误语义、排序、并发和脱敏行为。
- 运行 SDK 与 CLI contract、实际 tarball 安装检查和真实宿主机 HTTP smoke。
- 保留 Web API、行为和视觉回归。
- 通过完整 `npm run verify` 与 `git diff --check`。

自动兼容工具不能独立决定语义兼容。错误码复用、默认排序、身份处理、事务提交结果、乐观并发和隐私脱敏必须由契约测试与代码审查固定。

## 发布边界

当前 `npm run release` 是服务器候选合并、永久部署和失败补偿事务，不是 npm package release。它不得承担：

- npm version bump；
- tag 或 changelog；
- CLI/SDK publish；
- registry authentication；
- npm provenance。

未来 CLI publish 必须使用独立入口、独立验证和当前任务中的明确授权。第一阶段只发布内部/私有 CLI 包，SDK bundle 在 CLI 中且不独立发布。包名、公开 scope、许可与公共 registry 策略在公开发布前另行决策。
