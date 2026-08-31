# Task 5：接入 AppController、CRUD 弹窗和响应式样式

## 结果

已在 Task 5 范围内完成 AppController 管理子路由接入、editor dialog 状态、委托式打开/关闭/排序/CRUD 生命周期处理，以及桌面表格、移动端卡片、sticky 排序栏和原生 dialog 样式。

## RED 证据

先新增 controller 行为测试并运行：

```text
npm run test:unit -- --run apps/web/src/core/app-controller.spec.ts
```

结果为 23 tests、4 failed。失败分别对应：

- nested admin route 的 section/sort 没有传入 renderer；
- delegated editor open/close 尚未实现；
- desktop sort 尚未通过 replaceState 更新 hash；
- CRUD 失败保留 editor 的行为测试在初始实现下通过。

失败原因均为缺少 Task 5 controller wiring，而非测试语法或运行时错误。

## GREEN 证据

实现后执行：

```text
node --version                         v24.20.0
npm --version                          11.19.1
npm run build:web                      passed
npm run test:unit -- --run ...         3 files passed, 33 tests passed
git diff --check                       passed
```

PostgreSQL 已按仓库约束启动，并成功执行 migration 与 seed。行为 E2E 启动成功；管理 E2E 首次运行暴露选择器问题，修复后因浏览器进程阻塞停止，后续修复轮次已重新通过管理流程。

全量 lint 仍受既有 `apps/api/src/app.integration.http.spec.ts:274` 的 unsafe `any` 错误阻塞；Task 5 controller 自身 lint 问题已修正。

## 改动文件

- `apps/web/src/core/app-controller.ts`
- `apps/web/src/core/app-controller.spec.ts`
- `styles.css`
- `tests/e2e/behavior.spec.ts`

## 审查修复轮次

- renderer 桌面用户表改为“名称、角色、状态、最近修改、操作”五列；角色表改为“名称、代码、权限数、状态、最近修改、操作”六列，移动卡片保持信息聚合。
- `changeIdentity()` 开始时清空 `adminEditor`；生命周期成功刷新后清空 editor 并重新渲染，失败路径保留 editor。
- E2E 管理记录按 viewport 使用 `.admin-mobile-card:visible` 或 `.admin-table:visible tr`，生命周期断言限定在目标记录。

修复轮次验证：

```text
npm run test:unit -- --run admin-renderer.spec.ts app-controller.spec.ts admin-sort.spec.ts
3 files passed, 36 tests passed
npm run build:web
passed
npm run test:e2e -- ... --grep 'admin view|mobile admin'
3 passed, 1 skipped（桌面/移动 CRUD 与移动卡片排序均通过）
npm run build:web
passed
npm run lint
1 existing error: apps/api/src/app.integration.http.spec.ts:274 unsafe any
git diff --check
passed
```

报告末尾保持单个换行，无额外空行。

## 最后一轮审查修复

- 桌面表格排序语义已移至对应 `th` 的 `ariaSort`，按钮保留可操作性且不重复声明排序状态。
- 新增单测覆盖当前排序列为 ascending/descending、其它 sortable 列为 none，以及 delete 失败时 editor 保留。

本轮验证：

```text
RED: 新增排序语义测试失败（th 排序状态为空）
GREEN: 3 files passed, 38 tests passed
npm run build:web: passed
git diff --check: passed
```
