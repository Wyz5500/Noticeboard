# HTTP SDK

当前 SDK 支持 Node 24.x，位于 `apps/cli/src/sdk`，没有独立 npm 包。唯一源码入口是 `index.ts`，独立构建入口为 `dist/sdk/index.js`。CLI 与 profile 已实现并通过该入口访问 HTTP；SDK/CLI 支持任务读取、创建、生命周期、续期和评论增改删。registry 发布仍未实现。

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

| 入口                                 | 返回值 / 参数         |
| ------------------------------------ | --------------------- |
| `createNoticeboardClient(options)`   | `NoticeboardClient`   |
| `client.tasks.list(options?)`        | `Promise<Task[]>`     |
| `client.tasks.get(taskId, options?)` | `Promise<Task>`       |
| `client.identities.list(options?)`   | `Promise<Identity[]>` |

### 写操作

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

SDK 要求调用者显式提供 `expectedVersion`，不预读、不重试、不隐藏冲突；业务输入校验与权限仍由服务器负责。任务创建只接受 HTTP 201，其余写操作只接受 200，全部复用任务响应校验。评论删除按既有 HTTP 契约发送包含版本的 JSON 请求体，并返回完整任务及已脱敏的 tombstone。

写入发生 network 或 protocol 失败时可能已经提交，调用者应重新读取服务器状态核对；不要直接重复任务创建、动作或评论操作。

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

合法 HTTP 4xx/5xx 错误信封按 API 错误处理，包括 generated 状态联合未声明的 429/5xx 和未知服务器错误码。非法 JSON、空成功正文、结构错误、非法错误信封和意外成功/重定向状态属于协议错误；例如 HTML 503 是带 `status: 503` 的协议错误。连接和响应体读取失败属于网络错误；取消时保留调用方取消 reason 为 cause。SDK 不定义 CLI 退出码。

无效 base URL 在构造时抛出 `TypeError`。请求头提供者或无效请求头参数的异常属于调用方配置问题，不伪装成远端 API 或网络错误。协议错误消息不包含原始响应正文。

## 构建与后续边界

`sdk:build` 通过现有 TypeScript 编译 ESM 与 `.d.ts`，不引入 runtime 依赖、workspace 或发布 manifest。generated transport 仍只允许从 tracked artifact 生成。SDK 构建包含内部 transport，但服务器生产镜像只复制 `dist/api` 和 `dist/web`。

CLI 已基于该入口实现 profile、demo identity、任务读取与全部任务/评论写命令、JSON 输出与退出码；配置、筛选、文件/stdin、删除确认、版本预读、30 秒超时和终端输出均由 CLI 负责。管理、reset、独立 SDK 发布与 TUI 仍未实现。
