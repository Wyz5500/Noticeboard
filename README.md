# 冒险家工会任务平台原型

零依赖单页原型。Codex 会话启动后会自动运行本地预览服务，直接访问：

```text
http://127.0.0.1:8000
```

也可以在项目目录手动运行：

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

然后访问 `http://127.0.0.1:8000`。

## Codex Hook 预览服务

项目内的 `.codex/hooks.json` 会在 Codex 会话启动、恢复或压缩上下文时启动预览服务，并在会话结束时停止由本项目启动的服务。修改 HTML、CSS 或 JavaScript 后，在浏览器刷新即可看到最新内容，不需要重启服务。

首次使用或修改 `.codex/hooks.json` 后，在 Codex 中运行 `/hooks`，审核并信任当前项目的 hook。若需要手动排查服务状态：

```bash
python3 .codex/hooks/preview_server.py status
python3 .codex/hooks/preview_server.py start
python3 .codex/hooks/preview_server.py stop
```

服务只绑定到 `127.0.0.1`，不会暴露到局域网。若 `8000` 已被其他程序占用，启动 hook 会失败；停止命令只会终止本项目脚本记录且命令行匹配的 HTTP 服务。

任务、当前身份和操作时间线保存在浏览器 `localStorage`。左下角可以切换身份，右上角可以恢复初始演示数据。

状态机测试（macOS 自带 JavaScriptCore）：

```bash
osascript -l JavaScript tests/state.test.js
```

预览服务生命周期测试：

```bash
python3 tests/preview_server_test.py
```

## 验证环境说明

本次验证记录了以下环境限制：

- 当前环境未安装 `node`，因此无法执行 `node --check`；JavaScript 语法与浏览器初始化改用 macOS JavaScriptCore (`osascript`) 检查。
- 当前环境的 `tidy` 版本不完整支持 HTML5，并且会将 UTF-8 中文误判为字符编码错误，因此不作为本项目 HTML 校验依据；改用 Python 标准库 HTML 解析器检查入口文档。
- 沙箱默认禁止监听本地端口。需要运行 `python3 -m http.server 8000 --bind 127.0.0.1` 时，必须授予本地服务权限；资源检查使用 `curl` 确认 `index.html`、`app.js`、`app-state.js` 和 `styles.css` 均可正常返回。
- 当前环境未提供浏览器自动化工具，因此未执行真实浏览器截图级的点击、刷新和移动端手动检查。

以上限制属于验证环境问题，不代表原型运行时的功能错误。
