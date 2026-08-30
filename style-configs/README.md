# 视觉主题配置

十套类型化主题位于 `apps/web/src/styles/configs/`，并由 `configs/index.ts` 按固定顺序注册：瑞士国际、粗野主义、包豪斯、Y2K / 赛博、复古终端、孟菲斯、编辑杂志、玻璃拟态、日式极简、像素 / 复古游戏界面。

每个模块导出一个 `StyleConfig`：唯一的 kebab-case `id`、中文 `label`，以及 `STYLE_TOKEN_NAMES` 要求的完整 CSS 自定义属性。字体必须使用本地安全字体栈，不允许网络字体。注册器会先验证整批配置，再一次性替换当前注册表；任何配置非法时整批回滚。未知或损坏的持久化 ID 回退到 `swiss-international`。

新增或调整主题时：

1. 在 `apps/web/src/styles/configs/` 新建配置并完整填写令牌。
2. 在 `configs/index.ts` 的明确位置注册，避免依赖文件系统顺序。
3. 只用 `styles.css` 中的 `body[data-style='…']` 规则增加颜色、字体、边框、阴影、背景或伪元素装饰，不改变共享节点顺序、布局、ARIA 或行为。
4. 更新注册顺序/令牌单元测试；视觉回归只更新并检查“瑞士国际”桌面与移动端基线，其他主题不纳入视觉截图验证。
5. 运行 `npm run test:unit`、`npm run test:visual` 和 `npm run verify`。

视觉偏好键保持为 `minecraft-guild-board-style`；它与演示身份偏好、服务器任务数据相互独立。
