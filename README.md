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
- 右上角头像菜单提供 10 种视觉风格切换：瑞士国际、粗野主义、包豪斯、Y2K / 赛博、复古终端、孟菲斯、编辑杂志、玻璃拟态、日式极简和像素 / 复古游戏界面，并提供重置演示数据入口。
- 响应式布局支持桌面和窄屏浏览，任务详情使用覆盖顶栏的抽屉，发布任务使用弹窗。

## 数据与持久化

浏览器 `localStorage` 中保存两类数据：

- `minecraft-guild-board-state`：任务数组和当前身份 ID。
- `minecraft-guild-board-style`：当前视觉风格 ID。

页面右上角头像菜单中的“重置演示数据”会恢复 4 项初始任务和用户 A 身份，不会重置已选择的视觉风格。不要在本地存储中保存凭据或其他秘密信息。

“我的任务”根据任务操作时间线中的最后一位有效操作人进行归属，因此任务被发布者验收或关闭后，可能会从接取者的“我的任务”列表转移到发布者名下。

## 未来技术路线

当前项目仍是零依赖的浏览器单页原型，使用 JavaScript、`localStorage` 和 Python 静态服务器；当前没有 Node.js、NestJS、PostgreSQL 或 Docker 后端。

未来引入后端，是为了将任务、身份、权限和状态从浏览器本地状态迁移为服务端能力，支持网页端、桌面端、移动端和其他客户端，并为未来数据库替换及桌面离线版保留架构空间。

目标技术栈：

- Node.js 24.x LTS
- TypeScript 严格模式（strict）
- NestJS + Fastify
- REST + OpenAPI 3
- 模块化单体
- PostgreSQL
- TypeORM 数据映射模式
- Docker

```text
网页端 / 桌面端 / 移动端客户端
              ↓ REST + OpenAPI
NestJS + Fastify 后端
              ↓
领域层 / 应用层
              ↓
仓储端口 / 事务端口
              ↓
PostgreSQL
```

四层职责保持清晰：领域层负责核心业务规则；应用层负责业务用例协调；表现层负责 HTTP API、DTO 和校验；基础设施层负责数据库、ORM、迁移和外部服务。

第一版使用 PostgreSQL，业务逻辑不直接依赖 TypeORM 或 PostgreSQL。未来桌面离线版可以在基础设施层增加 SQLite 适配器，但 SQLite 适配器不属于当前版本。

客户端通过 REST/OpenAPI 访问后端，未来可以使用原生 TypeScript、Vue、React、桌面端或移动端；数据库实体不直接作为 API 响应。

迁移顺序：

1. 固定 Node.js 24.x LTS 和 TypeScript 工具链。
2. 识别并提取 `app-state.js` 中与浏览器环境无关的核心业务规则。
3. 建立 PostgreSQL 数据模型和迁移。
4. 建立 NestJS REST API。
5. 将前端任务数据从 `localStorage` 切换到 API。
6. 增加 Docker 部署。
7. 在桌面离线需求明确后增加 SQLite 适配器。

上述 Node.js、NestJS、PostgreSQL 和 Docker 内容属于未来技术路线，当前仓库尚未实现；当前原型的启动方式、测试方式和 `localStorage` 行为保持不变。

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
