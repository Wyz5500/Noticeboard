# Noticeboard CLI

需要 Node 24.x。此包仅用于内部本地安装，尚未发布 registry。

```bash
noticeboard --help
noticeboard profile set dev --base-url "http://127.0.0.1:<宿主机动态端口>"
noticeboard profile use dev
noticeboard identity list
noticeboard identity use noticeboard-master
noticeboard task list --mine --json
noticeboard task get <task-id> --json
noticeboard admin overview --user noticeboard-admin --json
noticeboard user list --user noticeboard-admin
noticeboard role list --user noticeboard-admin
noticeboard permission list --user noticeboard-admin
```

公共参数：`--profile`、`--base-url`、`--user`、`--json`、`--help`。
解析优先级：命令参数 > `NOTICEBOARD_*` 环境变量 > profile > 本地 demo 默认值。
默认地址为 `http://127.0.0.1:3000`，默认身份为 `noticeboard-master`；本地开发请显式设置动态端口。

配置使用平台用户目录，可通过绝对路径 `NOTICEBOARD_CONFIG_FILE` 隔离。读取不创建文件。
`identity use` 仅修改当前激活 profile；删除当前 profile 前必须先 `profile use` 切换。
`profile delete <name>` 在非 TTY 或 JSON 模式下必须提供 `--yes`。

JSON 成功只在 stdout 输出 `{ "data": ... }`；错误只在 stderr 输出
`{ "error": { "kind": ..., "message": ... }, "meta": { "exitCode": ... } }`。
退出码：0 成功、1 内部/未分类、64 输入/配置、65 协议、66 不存在、69 网络/服务不可用、75 冲突/限流、77 身份/权限。
HTTP 请求不重试，单次命令请求窗口为 30 秒。

管理总览及三类列表要求服务器授予 `system.manage`，默认普通身份会返回 403/退出码 77。
每条命令只读取一次完整 overview，列表保留服务器顺序和已逻辑删除记录，不自动切换身份或改写配置。
JSON `data` 为完整 `{users, roles, permissions}` 或对应数组，无成功 meta；人类输出为中文表格。
管理写入、详情及筛选尚未实现。

`X-Demo-User-Id` 仅用于 demo 身份选择。正式认证及 TUI 尚未实现。

任务写入：`task create`、`task act`、`task renew`；评论写入：`comment create/edit/delete`，精确参数见 `noticeboard task --help` 和 `noticeboard comment --help`。
描述和评论支持直接文本、UTF-8 文件或 `--description-file -` / `--content-file -` stdin，多行原文交给服务器处理。

`--expected-version` 显式指定版本时直接提交；省略时只预读一次任务。冲突返回 75，不自动刷新或重放。
评论删除在非 TTY 或 JSON 模式必须带 `--yes`；普通 TTY 请求确认。任务动作直接执行。
写入 JSON 的 `data` 为完整任务；除任务创建外，`meta.expectedVersion` 记录提交版本。
网络或协议失败可能已经提交，应先读取服务器状态核对，不要直接重复写入。
