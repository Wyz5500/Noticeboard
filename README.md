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
