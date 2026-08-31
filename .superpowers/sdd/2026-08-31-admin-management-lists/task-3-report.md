# Task 3：管理子路由和纯排序逻辑报告

## 实现

- 新增 `apps/web/src/admin/admin-sort.ts`：统一定义 `AdminSection`、排序字段、方向和状态，提供默认排序、字段切换和不修改输入数组的稳定排序。
- 用户排序字段为 `name`、`role`、`status`、`updatedAt`；角色排序字段为 `name`、`code`、`permissions`、`status`、`updatedAt`。
- 新增 `apps/web/src/admin/admin-sort.spec.ts`，覆盖默认最近修改排序、升降序、权限数值比较和 `id` 升序 tie-break。
- 修改 `apps/web/src/core/router.ts`：识别 `#admin`、`#admin/users`、`#admin/roles`，规范化子页 `sort` / `direction`，新增 `buildAdminHash`；非法或缺失排序回退 `updatedAt desc`，既有任务 hash 逻辑保持不变。
- 修改 `apps/web/src/core/router.spec.ts`，覆盖子路由、排序参数规范化和 admin hash 构建。

## TDD 命令证据

### RED

```text
$ npm run test:unit -- apps/web/src/admin/admin-sort.spec.ts apps/web/src/core/router.spec.ts
Test Files  2 failed | 0 passed
Tests       3 failed | 3 passed
```

失败原因为预期的缺失行为：`admin-sort.js` 不存在；`#admin/users` 未识别；`#admin` 缺少 `section`；`buildAdminHash` 不存在。

### GREEN

```text
$ npm run test:unit -- apps/web/src/admin/admin-sort.spec.ts apps/web/src/core/router.spec.ts
Test Files  2 passed (2)
Tests       10 passed (10)

$ npm run typecheck
exit 0
```

## 最终验证

```text
$ npm run test:unit
Test Files  15 passed (15)
Tests       87 passed (87)

$ npm run typecheck
exit 0

$ npx eslint apps/web/src/admin/admin-sort.ts apps/web/src/admin/admin-sort.spec.ts apps/web/src/core/router.ts apps/web/src/core/router.spec.ts
exit 0

$ npm run comments
comment checks passed (121 handwritten files)

$ npm run architecture
architecture checks passed (96 source files)

$ npx prettier --check <本任务四个文件>
All matched files use Prettier code style!

$ git diff --check
exit 0
```

## 变更文件

- `apps/web/src/admin/admin-sort.ts`
- `apps/web/src/admin/admin-sort.spec.ts`
- `apps/web/src/core/router.ts`
- `apps/web/src/core/router.spec.ts`

## 关注事项

- 当前 Node 18/npm 10 不符合仓库要求，验证使用 Node `24.20.0` / npm `11.19.1`。
- 全仓 `npm run lint` 仍被 Task 2 已有的 `apps/api/src/app.integration.http.spec.ts:274` unsafe `any` 报错阻断；本任务四个文件的 ESLint 已单独通过，未越界修改该既有问题。
