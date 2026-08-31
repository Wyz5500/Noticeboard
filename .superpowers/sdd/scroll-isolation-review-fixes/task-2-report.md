# Task 2 报告：route-scoped scroll restoration 和 hash click interception

## 改动

- `apps/web/src/core/app-controller.ts`
  - `ViewScrollState` 保存规范化任务路由 key，并增加 `renderedRoute` 快照。
  - 离开任务视图时使用旧的已渲染 route 生成缓存 key。
  - 只有缓存 key 与目标任务 route 完全匹配时恢复 `windowY`、`taskGridY`、`taskSidebarY`；不匹配时三者均归零。
  - 同一 tasks 视图变更 scope/filter/query 时同步清零 grid 和 sidebar。
  - `navigateTasks`、`handleHashNavigation` 使用 `normalizeHash` 去重。
  - hash click 在 `defaultPrevented`、非主键或 Meta/Ctrl/Shift/Alt 修饰时不拦截；普通键盘 click 仍可进入 SPA 路由。
- `tests/e2e/behavior.spec.ts`
  - 添加移动端跨不同任务 route 的三层滚动归零回归测试。
  - 添加活动任务筛选/导航不增加 history 的回归测试。
  - 添加 Meta/Ctrl/中键 hash click 不改变 hash/history 的回归测试。

## TDD RED/GREEN

固定运行时：Node `v24.20.0`，npm `11.19.1`。

RED 命令：

```bash
npm exec -- playwright test tests/e2e/behavior.spec.ts --project=chromium-mobile --grep 'resets all task scroll layers|does not add history|does not intercept modified'
```

首次运行因移动端筛选前置条件未展开、测试数据选择不匹配而先修正测试；修正后旧实现仍按预期失败：移动端 route 测试的 sidebar 初始滚动受布局限制为 0，活动控件导致 history 从 3 增至 5，修饰/中键 click 最终将 hash 改为 `#home`。

GREEN 同一命令输出：`3 passed (4.0s)`。

## 测试与验证

- `npm run build:web`：通过。
- `npm run test:unit`：14 files、83 tests passed。
- 目标文件 `prettier --check`：通过。
- `npm run typecheck`、`npm run lint`、`npm run comments`、`npm run architecture`：均通过。
- `npm run test:e2e`：54 passed、4 skipped；桌面和移动项目均执行。
- `npm run test:api`：13 passed、3 skipped。
- `npm run test:contract`：15 skipped（仓库现有配置状态）。
- `npm run test:visual`：4 passed。
- `git diff --check`：通过。

`npm run verify` 已运行并完成 PostgreSQL migrate/seed，但在全仓库 `format:check` 阶段停止：既有 `.superpowers/sdd/scroll-isolation-review-fixes/progress.md` 和 `task-1-brief.md` 未通过格式检查。两者不属于本任务允许修改范围；目标文件已单独通过格式检查，后续 verify 检查已手动补跑。

## 文件

- `apps/web/src/core/app-controller.ts`
- `tests/e2e/behavior.spec.ts`
- `.superpowers/sdd/scroll-isolation-review-fixes/task-2-report.md`

## 自审

- 未修改 router 或其他业务文件。
- 使用旧 `renderedRoute` 生成离开任务页缓存 key，避免混入新目标 route。
- 任务 route key 通过 Task 1 的 `normalizeHash` 生成和比较。
- 三层任务滚动在 route 不匹配时全部显式归零。
- 点击过滤发生在 `preventDefault` 之前；普通键盘 click 不依赖 `detail`，仍可路由。
- 工作树未合并回 main，diff 无 whitespace 错误。

## Concerns

- 全仓库 `npm run verify` 仍受两个既有 `.superpowers` 文档格式问题阻断；未修改这些范围外文件。
- contract 测试由仓库配置全部 skip，未提供有效契约断言执行证据。
