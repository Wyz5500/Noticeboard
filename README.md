# 冒险家工会任务平台原型

这是一个零依赖的浏览器单页原型，用于演示冒险家工会的任务发布、接取、交付和验收流程。项目不需要构建工具、包管理器、后端服务、图片或网络字体。

## 快速开始

可以直接打开 `index.html`，也可以在项目根目录启动静态服务器：

```bash
python3 -m http.server 8000
```

然后访问 <http://localhost:8000>。

## 已实现功能

- 预置 4 项演示任务，支持查看任务详情、奖励、截止时间和操作时间线。
- 右上角头像菜单支持 3 个演示身份（用户 A、用户 B、用户 C）切换；每个已知身份都可以发布任务。
- 顶栏固定在浏览器可见区域顶部；头像菜单内的身份切换和视觉风格选择使用统一的下拉控件样式。
- 支持任务流程：`未开始` → `进行中` → `已完成`，发布者可以验收关闭，或重新打开后再次接取；重新打开的任务也可以由发布者直接关闭。
- 任务操作权限由 `app-state.js` 统一判断：接取任务由任意已知身份执行，标记完成由当前接取者执行，验收、重新打开和关闭由任务发布者执行。
- 任务页支持“全部任务 / 我的任务”、状态筛选和关键词搜索；筛选条件与搜索词会写入 URL hash，例如 `#tasks?scope=mine&filter=进行中&q=矿井`。
- 右上角头像菜单提供 10 种视觉风格切换：Swiss International、Neo-Brutalism、Bauhaus、Y2K / Cyber、Retro Terminal、Memphis、Editorial Magazine、Glassmorphism、Japanese Minimalism 和 Pixel / Retro Game UI，并提供重置演示数据入口。
- 响应式布局支持桌面和窄屏浏览，任务详情使用抽屉，发布任务使用弹窗。

## 数据与持久化

浏览器 `localStorage` 中保存两类数据：

- `minecraft-guild-board-state`：任务数组和当前身份 ID。
- `minecraft-guild-board-style`：当前视觉风格 ID。

页面右上角头像菜单中的“重置演示数据”会恢复 4 项初始任务和用户 A 身份，不会重置已选择的视觉风格。不要在本地存储中保存凭据或其他秘密信息。

“我的任务”根据任务操作时间线中的最后一位有效操作人进行归属，因此任务被发布者验收或关闭后，可能会从接取者的“我的任务”列表转移到发布者名下。

## 项目结构

| 文件或目录 | 用途 |
| --- | --- |
| `index.html` | 页面结构、导航、任务列表、头像菜单、详情抽屉和发布任务弹窗 |
| `app.js` | DOM 渲染、路由同步、表单提交和交互事件 |
| `app-state.js` | 任务模型、权限、状态转换、时间线和任务数据持久化 |
| `style-preferences.js` | 视觉风格注册、校验、读取、保存和 CSS 变量应用 |
| `style-configs/*.js` | 各视觉风格的 CSS 变量配置；设计约束见 `style-configs/README.md` |
| `styles.css` | 基础布局、组件样式、响应式规则和各风格装饰规则 |
| `tests/state.test.js` | 任务状态机、权限、路由、筛选和任务持久化测试 |
| `tests/style.test.js` | 风格注册、令牌、持久化、页面接线和主题样式测试 |

## 测试与验证

在项目根目录运行 macOS 自带的 JavaScriptCore 测试：

```bash
osascript -l JavaScript tests/state.test.js
osascript -l JavaScript tests/style.test.js
git diff --check
```

前两个命令分别应输出 `state tests passed` 和 `style tests passed`。修改交互或样式后，还应在浏览器中检查空列表、长标题、移动端布局、头像菜单中的身份切换与风格切换、重置确认、点击外部关闭、Escape 关闭、刷新后的持久化，以及任务抽屉和发布弹窗的键盘关闭行为。
