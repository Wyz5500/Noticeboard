# HTTP SDK

当前 SDK 支持 Node 24.x，位于 `apps/cli/src/sdk`，没有独立 npm 包。唯一源码入口是 `index.ts`，独立构建入口为 `dist/sdk/index.js`。CLI 与 profile 已实现并通过该入口访问 HTTP；SDK/CLI 支持任务读取、创建、生命周期、续期、评论增改删和管理资源读写。registry 发布仍未实现。

## 构建与使用

```bash
npm run sdk:typecheck
npm run sdk:build
npm run test:sdk
```

这三个命令不需要数据库。真实 HTTP smoke 随 `npm run verify` 的 API 测试运行；验证只使用隔离 PostgreSQL 和动态端口的宿主机应用。

在仓库根目录运行以下调用方示例；先把调用方环境变量 `NOTICEBOARD_BASE_URL` 设置为宿主机应用打印的实际 URL 或远端服务地址：

```js
import { createNoticeboardClient } from './dist/sdk/index.js';

const client = createNoticeboardClient({
  baseUrl: process.env.NOTICEBOARD_BASE_URL,
  getHeaders: () => ({ 'X-Demo-User-Id': 'noticeboard-master' }),
});

const identities = await client.identities.list();
const tasks = await client.tasks.list();
const detail = tasks[0] ? await client.tasks.get(tasks[0].id) : null;
console.log({ identities, tasks, detail });
```

示例中的环境变量读取与输出属于调用方。SDK 自身不读取环境、文件、配置或数据库，不打印 stdout/stderr，也不保存身份、任务或凭据。`X-Demo-User-Id` 仅用于 demo 身份选择，不是正式认证。

## 公共接口

| 入口                                 | 返回值 / 参数            |
| ------------------------------------ | ------------------------ |
| `createNoticeboardClient(options)`   | `NoticeboardClient`      |
| `client.tasks.list(options?)`        | `Promise<Task[]>`        |
| `client.tasks.get(taskId, options?)` | `Promise<Task>`          |
| `client.identities.list(options?)`   | `Promise<Identity[]>`    |
| `client.admin.overview(options?)`    | `Promise<AdminOverview>` |

### 管理读取

`admin.overview` 通过一次 `GET /api/v1/admin/overview` 读取完整 `{users, roles, permissions}`，只接受 HTTP 200。服务器要求当前身份具有 `system.manage`；SDK 不默认选择管理员，不通过 demo 身份列表推导或预检权限。

```js
const adminClient = createNoticeboardClient({
  baseUrl: process.env.NOTICEBOARD_BASE_URL,
  getHeaders: () => ({ 'X-Demo-User-Id': 'noticeboard-admin' }),
});
const overview = await adminClient.admin.overview();
console.log(overview.users, overview.roles, overview.permissions);
```

SDK 根入口新增手写 `AdminOverview`、`AdminUser`、`AdminRole` 和 `AdminPermission` 类型，字段对应 tracked OpenAPI 的管理响应，权限码复用现有 `Permission`。全部数组保持服务器顺序，包含已逻辑删除的用户和角色；`active`、`builtin`、`deletedAt` 和 `updatedAt` 原样保留，日期为字符串。校验完整 overview 的所有已知字段及嵌套成员，忽略新增未知字段。取消、401/403、网络和协议错误沿用公共请求合同；不缓存或重试。

### 任务与评论写操作

全部方法返回 `Promise<Task>`，最后一个 `options?: RequestOptions` 与读取共享身份和取消规则。

| 方法                                                  | 手写输入类型         | 必填字段                                            |
| ----------------------------------------------------- | -------------------- | --------------------------------------------------- |
| `tasks.create(input, options?)`                       | `CreateTaskInput`    | `title`, `type`, `description`, `reward`, `dueDate` |
| `tasks.act(taskId, input, options?)`                  | `ActTaskInput`       | `action`, `expectedVersion`                         |
| `tasks.renew(taskId, input, options?)`                | `RenewTaskInput`     | `dueDate`, `recoveryStrategy`, `expectedVersion`    |
| `comments.create(taskId, input, options?)`            | `CreateCommentInput` | `content`, `expectedVersion`                        |
| `comments.edit(taskId, commentId, input, options?)`   | `EditCommentInput`   | `content`, `expectedVersion`                        |
| `comments.delete(taskId, commentId, input, options?)` | `DeleteCommentInput` | `expectedVersion`                                   |

`TaskAction` 为 `accept | complete | approve | reopen | close`；`TaskRecoveryStrategy` 为 `preserve_status | reopened`。这些类型均从 SDK 根入口导出，字段与 tracked OpenAPI 对齐；不继承或引用 generated 声明。

SDK 要求调用者显式提供 `expectedVersion`，不预读、不重试、不隐藏冲突；业务输入校验与权限仍由服务器负责。任务创建只接受 HTTP 201，其余任务/评论写操作只接受 200，全部复用任务响应校验。评论删除按既有 HTTP 契约发送包含版本的 JSON 请求体，并返回完整任务及已脱敏的 tombstone。

写入发生 network 或 protocol 失败时可能已经提交，调用者应重新读取服务器状态核对；不要直接重复任务创建、动作或评论操作。

### 管理写入

`admin.users` 与 `admin.roles` 分别提供 `create(input, options?)`、`update(id, input, options?)`、`delete(id, options?)`、`restore(id, options?)`。用户方法返回 `Promise<AdminUser>`，角色方法返回 `Promise<AdminRole>`；两类删除均返回 `Promise<void>`。最后一个参数为 `RequestOptions`，复用身份注入与取消合同。

| 手写输入类型           | 字段                                           |
| ---------------------- | ---------------------------------------------- |
| `CreateAdminUserInput` | 必填 `name`、`roleId`                          |
| `UpdateAdminUserInput` | 可选 `name`、`roleId`，省略字段不提交          |
| `CreateAdminRoleInput` | 必填 `name`，可选 `permissions: Permission[]`  |
| `UpdateAdminRoleInput` | 必填 `name` 与完整 `permissions: Permission[]` |

四种输入类型从 SDK 根入口导出。创建接受 HTTP 201，更新和恢复接受 200，完整校验对应管理资源并忽略新增字段；删除接受 204 空响应，不解析资源。删除与恢复没有请求体。管理 API 没有 `expectedVersion`，SDK 不添加版本、不预读、不重试；并发编辑可能覆盖其他调用方的修改。角色更新是完整权限替换，空数组表示清空；创建省略权限使用服务器的空权限默认值。

全部管理写入要求 `system.manage`，不自动选择管理员或在客户端预检业务约束。网络或协议失败可能已经提交，应通过 overview 核对用户/角色后再决定操作。

### 演示任务重置

`client.demo.reset(options?: RequestOptions): Promise<DemoResetResult>` 调用已有 `POST /api/v1/demo/reset`，无请求体且只接受 HTTP 200。根入口导出手写 `DemoResetResult`，其必填字段为 `reset: boolean`；按 tracked OpenAPI 接受 true 和 false，忽略新增字段，不将服务器当前的 `{reset:true}` 示例当作字面量约束。

服务器要求 `demo.reset` 权限，在事务中替换全部任务及时间线为演示数据，保留用户和角色。SDK 不做权限预检、不选择身份、不确认、不预读、不重试；调用方负责确认。身份提供者与取消信号沿用公共请求合同。网络或协议失败可能已提交，调用方应读取任务列表及详情核对，不能直接重放。此能力仅用于演示环境。

### 请求配置

构造参数 `NoticeboardClientOptions`：

- `baseUrl: string` 必填。必须是绝对 HTTP(S) 地址，禁止 URL 凭据、query、fragment（含空 `?` / `#`）。尾部斜杠规范化；路径前缀保留。例如 `https://example.test/proxy/` 请求 `https://example.test/proxy/api/v1/tasks`。不要把 `/api/v1` 当作 base URL 后缀。
- `fetch?: typeof globalThis.fetch` 注入实例独立的 Fetch；默认使用构造时的全局 Fetch，不修改全局对象。
- `getHeaders?: HeadersProvider` 每次请求调用，返回 `HeadersInit` 或 `Promise<HeadersInit>`。SDK 复制请求头，不修改提供者返回值；不注入默认身份。提供者自身异常原样传播。
- `signal?: AbortSignal` 为默认取消信号。每个资源方法也接收 `RequestOptions` 中的 `signal`；与默认信号合并，任一取消都取消请求。已取消的请求不调用 Fetch；提供者求值期间取消时，在其完成后阻止 HTTP 请求。

每次调用只执行一次 generated operation，不重试、不缓存、不筛选、不排序。任务 ID 由 generated transport 编码。服务端是身份、权限、任务状态与时间线的权威来源。

公共资源类型包括 `Identity`、`Permission`、`Task`、`TaskType`、`TaskStatus`、`TaskWorkflowStatus`、`TaskActivityAction`、`TaskActivity`、`TaskComment` 和 `TaskTimelineEvent`；字段以 tracked OpenAPI 为依据。日期始终是字符串，版本和服务器顺序原样保留；时间线通过 `kind` 区分生命周期活动和评论，保留 `edited` 与删除 tombstone。

手写类型不继承、别名引用或 re-export generated 符号。SDK 公共声明的传递依赖不包含 generated 类型；CLI 与未来 TUI 只允许使用公共入口。Web 继续使用现有 ApiClient。

## 响应校验与错误

SDK 完整校验读取及全部写操作响应的已知结构：字段类型、必填性、nullable、闭合枚举、数组成员与时间线联合。容忍服务端新增字段，但只映射已声明字段；不做类型强制转换，不重复实现服务端业务规则。手写资源类型与 generated 类型的结构一致性、逐字段响应破坏测试都属于验证门禁。

| 错误类                     | `kind`     | 保留信息                                                                    |
| -------------------------- | ---------- | --------------------------------------------------------------------------- |
| `NoticeboardApiError`      | `api`      | `status`、开放字符串 `code`、`message`、可选 `details`、`path`、`timestamp` |
| `NoticeboardNetworkError`  | `network`  | `reason: 'network' \| 'aborted'`、原始 `cause`                              |
| `NoticeboardProtocolError` | `protocol` | 可取得的 HTTP `status`、诊断 `message`、可选 `cause`                        |

合法 HTTP 4xx/5xx 错误信封按 API 错误处理，包括 generated 状态联合未声明的 429/5xx 和未知服务器错误码。非法 JSON、需要资源时的空成功正文、结构错误、非法错误信封和意外成功/重定向状态属于协议错误；例如 HTML 503 是带 `status: 503` 的协议错误。连接和响应体读取失败属于网络错误；取消时保留调用方取消 reason 为 cause。SDK 不定义 CLI 退出码。

无效 base URL 在构造时抛出 `TypeError`。请求头提供者或无效请求头参数的异常属于调用方配置问题，不伪装成远端 API 或网络错误。协议错误消息不包含原始响应正文。

## 构建与后续边界

`sdk:build` 通过现有 TypeScript 编译 ESM 与 `.d.ts`，不引入 runtime 依赖、workspace 或发布 manifest。generated transport 仍只允许从 tracked artifact 生成。SDK 构建包含内部 transport，但服务器生产镜像只复制 `dist/api` 和 `dist/web`。

CLI 已基于该入口实现 profile、demo identity、任务读取与全部任务/评论写命令、管理总览及用户/角色/权限列表、JSON 输出与退出码；配置、筛选、文件/stdin、删除确认、版本预读、30 秒超时和终端输出均由 CLI 负责。管理详情、筛选、写入及 demo reset 均已实现；独立 SDK 发布与 TUI 仍未实现。
