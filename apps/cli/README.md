# Noticeboard 只读 CLI

需要 Node 24.x。此包仅用于内部本地安装，尚未发布 registry。

```bash
noticeboard --help
noticeboard profile set dev --base-url "http://127.0.0.1:<宿主机动态端口>"
noticeboard profile use dev
noticeboard identity list
noticeboard identity use noticeboard-master
noticeboard task list --mine --json
noticeboard task get <task-id> --json
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

`X-Demo-User-Id` 仅用于 demo 身份选择。任务和评论写操作、正式认证及 TUI 尚未实现。
