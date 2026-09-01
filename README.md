# 告示牌 Noticeboard

告示牌（Noticeboard）是一个由 NestJS + Fastify 提供 API 和静态页面、以 PostgreSQL 为任务权威数据源的模块化单体。原生 TypeScript 前端保留原型的中文文案、hash 路由、无障碍契约和十套视觉主题。

## 快速开始

安装 Node.js 24.20.0 与 npm 11.19.1，然后在仓库根目录进行本地启动。

运行以下命令前，请先确保 Docker daemon 已运行；macOS 和 Windows 请先启动 Docker Desktop，Linux 请确保 Docker 服务已启动。

Linux、macOS 和 Windows：

```bash
npm ci
npm run instance -- up
npm run instance -- status
```

`status` 会打印当前 worktree 的页面、Swagger 和数据库地址。每个 worktree 使用独立的 Compose project、PostgreSQL 容器、网络和卷，应用与数据库宿主机端口由 Docker 动态分配。

停止当前实例但保留数据：

```bash
npm run instance -- down
```

删除当前实例及其数据库数据：

```bash
npm run instance -- destroy --yes
```

销毁后当前 worktree 会从干净数据库重新初始化；历史迁移卷仍保留为备份，但不会再次导入到该实例。

完整验证也使用当前实例，成功后移除容器和网络，失败时保留现场：

```bash
npm run instance -- verify
npm run instance -- verify --keep  # 成功后也保留实例
```

访问地址以 `npm run instance -- status` 的输出为准。Linux/macOS 下的兼容旧入口部署脚本仍可启动当前 worktree 实例：

```bash
scripts/deploy.sh
```

Compose 会依次等待 PostgreSQL、执行 migration、在任务表为空时写入演示 seed，再以非 root、只读文件系统运行无状态应用。重复部署不会覆盖已有任务。需要显式恢复演示数据时使用页面中的重置操作或 demo reset API。

## 演示行为与数据

- 独立的 `noticeboard-admin` 演示身份负责用户与角色管理；`noticeboard-master`、`adventurer-a`、`adventurer-b` 保持普通用户任务身份。
- 角色权限控制任务 API 和管理 API；管理员拥有全部权限，普通用户拥有全部任务操作权限但不能管理用户、角色或重置演示数据。
- “我的任务”归属于时间线中最后一位仍有效的操作人。
- 列表筛选、搜索和统计在启动时加载的内存快照上执行；创建、状态操作和重置才访问 API。
- PostgreSQL 保存角色、角色权限、账户、任务和有序时间线。`GET /api/v1/admin/overview` 与 `/api/v1/admin/users`、`/api/v1/admin/roles` 提供 demo-only 管理能力；`POST /api/v1/demo/reset` 仍只在一个事务中恢复十二项演示任务。
- `localStorage` 只保存 `{currentUserId}`（键 `noticeboard-user`）和视觉偏好（键 `noticeboard-style`）；不要在本地存储中保存秘密。

`X-Demo-User-Id`、`/api/v1/demo/*`、seed 与 reset 均为 demo-only。HTTP 请求与响应字段只以 OpenAPI 文档为准。

## 常用命令

```bash
npm run build              # 编译 API、浏览器 TypeScript 与静态页面
npm run start:dev          # 监听后端源文件；修改前端后需重新 build:web
npm run db:migrate         # 显式执行数据库迁移
npm run db:revert          # 回退最近一次迁移
npm run db:seed            # 幂等写入身份，仅为空任务表初始化演示任务
npm run test:unit          # 领域、应用与前端单元测试
npm run test:api           # HTTP 契约及真实模块集成测试
npm run test:contract      # PostgreSQL 仓储契约测试
npm run test:e2e           # Chromium 行为测试
npm run test:visual        # 桌面/移动端零像素视觉测试
npm run instance -- status  # 显示当前实例和动态端口
npm run verify             # 完整交付门禁
```

数据库命令读取 `DATABASE_URL`；API/契约集成测试读取 `DATABASE_URL_TEST`。由实例 CLI 执行的验证会自动注入当前实例的 `DATABASE_URL_TEST` 和 `E2E_BASE_URL`；Playwright 检测到 `E2E_BASE_URL` 后不会再启动第二个本地应用。

## 项目结构

- `apps/api/src/{tasks,identity,authorization,health}`：按功能模块组织的 Domain / Application / Presentation / Infrastructure 代码。
- `apps/web/src/{core,tasks,profile,styles}`：API 客户端、内存状态、路由、渲染、交互和类型化主题。
- `apps/api/src/common/infrastructure/database/migrations`：唯一数据库模式变更入口。
- `tests/e2e`：行为测试与由旧原型冻结的视觉基线。
- `docs/architecture.md`：架构决策、边界和事务设计。
- `style-configs/README.md`：主题令牌与注册说明。
- `Dockerfile`、`compose.yaml`：固定版本的构建与本地部署。

## 健康与关闭

`GET /health/live` 只检查进程存活；`GET /health/ready` 探测 PostgreSQL，未就绪时返回 503。应用输出结构化 JSON 日志，接收终止信号后执行 Nest/Fastify 优雅关闭。
