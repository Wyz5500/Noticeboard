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

PostgreSQL 已按仓库约束启动，并成功执行 migration 与 seed。行为 E2E 启动成功，已有行为测试大部分通过；管理 E2E 首次失败于测试选择器的多元素 strict-mode，修正后重跑时浏览器进程在管理流程中无输出并阻塞，已按要求停止，未继续扩大修改范围。

全量 lint 仍受既有 `apps/api/src/app.integration.http.spec.ts:274` 的 unsafe `any` 错误阻塞；Task 5 controller 自身 lint 问题已修正。

## 改动文件

- `apps/web/src/core/app-controller.ts`
- `apps/web/src/core/app-controller.spec.ts`
- `styles.css`
- `tests/e2e/behavior.spec.ts`

