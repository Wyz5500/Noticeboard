# 冒险家工会任务平台原型

零依赖单页原型，直接打开 `index.html` 即可使用；也可以在项目目录运行：

```bash
python3 -m http.server 8000
```

然后访问 `http://localhost:8000`。

任务、当前身份和操作时间线保存在浏览器 `localStorage`。左下角可以切换身份，右上角可以恢复初始演示数据。

状态机测试（macOS 自带 JavaScriptCore）：

```bash
osascript -l JavaScript tests/state.test.js
```

## 验证环境说明

本次验证记录了以下环境限制：

- 当前环境未安装 `node`，因此无法执行 `node --check`；JavaScript 语法与浏览器初始化改用 macOS JavaScriptCore (`osascript`) 检查。
- 当前环境的 `tidy` 版本不完整支持 HTML5，并且会将 UTF-8 中文误判为字符编码错误，因此不作为本项目 HTML 校验依据；改用 Python 标准库 HTML 解析器检查入口文档。
- 沙箱默认禁止监听本地端口。需要运行 `python3 -m http.server 8000 --bind 127.0.0.1` 时，必须授予本地服务权限；资源检查使用 `curl` 确认 `index.html`、`app.js`、`app-state.js` 和 `styles.css` 均可正常返回。
- 当前环境未提供浏览器自动化工具，因此未执行真实浏览器截图级的点击、刷新和移动端手动检查。

以上限制属于验证环境问题，不代表原型运行时的功能错误。
