# Noticeboard HTTP SDK

独立本地 npm 包 `noticeboard-sdk-local@0.0.0`，需要 Node 24.x，使用 ESM，无运行时 npm 依赖。包标记为 `private: true`，尚未发布 registry。

使用 npm 11.x 安装本地 tarball：

```bash
npm install /绝对路径/noticeboard-sdk-local-0.0.0.tgz
```

```js
import { createNoticeboardClient } from 'noticeboard-sdk-local';

const client = createNoticeboardClient({
  baseUrl: 'http://127.0.0.1:3000', // 已运行服务的地址；开发实例请填实际动态端口
  getHeaders: () => ({ 'X-Demo-User-Id': 'noticeboard-master' }),
});
const tasks = await client.tasks.list();
console.log(tasks);
```

仅包根入口是公共 API，包含 `createNoticeboardClient`、手写资源/输入/选项类型，以及 `NoticeboardApiError`、`NoticeboardNetworkError`、`NoticeboardProtocolError`。`internal`、`generated` 和其他子路径不对外开放。

当前资源为 `tasks.list/get/create/act/renew`、`comments.create/edit/delete`、`identities.list`、`admin.overview`、`admin.users` / `admin.roles` 的 `create/update/delete/restore` 和 `demo.reset`。类型声明随包交付，日期保持字符串。

每实例显式提供 `baseUrl`，可注入 `fetch`、同步/异步 `getHeaders` 和默认 `signal`；每次调用支持单独 `signal`。SDK 不读取 CLI profile，不保存秘密，不选择默认身份，不重试。任务/评论版本化写入必须显式提供 `expectedVersion`；409 后先核对服务器状态，禁止自动重放。网络或协议失败可能发生在提交之后。

`X-Demo-User-Id` 只用于演示身份选择，不是正式认证。SDK 需要已有 HTTP API 才能执行业务操作，不安装服务器或 PostgreSQL。

近期开发聚焦 CLI，TUI 暂缓；两类客户端使用同一 SDK 与版本化 HTTP 合同。本地包安装不等于 registry 发布，正式包名、版本和发布策略另行决定。
