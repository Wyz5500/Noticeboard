# 方案一首页视觉 QA

## 对照目标

- source visual truth: `design-concepts/home-redesign/home-redesign-1.png`
- implementation screenshot: `tests/e2e/visual.spec.ts-snapshots/swiss-international-home-chromium-desktop-darwin.png`
- combined comparison input: `design-concepts/home-redesign/qa-comparison.png`
- viewport: 1440 x 1000 CSS px, Chromium desktop, deviceScaleFactor 1
- source pixels: 1487 x 1058
- implementation pixels: 1440 x 1120 full-page screenshot
- density normalization: 未缩放；目标稿按生成结果保留原始像素，实现按同一桌面状态捕获，QA 以布局比例、层级和可读性为主进行对照
- state: 首页、用户 A、Swiss 国际主题、无覆盖层

## 检查结果

### 全视图

`qa-comparison.png` 将源视觉稿和实现截图放在同一输入中。左侧主内容、右侧状态轨道、总任务摘要、下一步建议和主 CTA 的信息层级与方案一一致；右侧状态轨道在桌面端保持单列，页面底部留白和顶部固定导航没有遮挡核心内容。

### 聚焦区域

摘要区和状态轨道在全视图中已足够清晰，不需要额外裁剪图。已检查总任务数字、动态说明、五个状态快捷入口、分隔线、CTA 文案与箭头的对齐和可读性。

### 五项保真面

- Fonts and typography: 沿用现有本地字体栈和主题字重；大标题、统计数字、辅助说明和状态标签层级清晰，移动端标题按现有响应式规则换行。
- Spacing and layout rhythm: 桌面端采用左侧主列 + 380px 状态轨道，摘要区为两列；840px 以下状态轨道转为独立区块，620px 以下状态项转为两列。
- Colors and visual tokens: 未新增颜色系统，主 CTA、线条、纸张背景和文本均使用现有 CSS token；已抽查 Swiss、粗野主义、复古终端主题。
- Image quality and asset fidelity: 目标稿没有产品图片、插画或非标准图标资产；实现没有添加占位图或自绘图形。
- Copy and content: 保留原有首页中文文案和六类任务状态，并新增由真实统计值驱动的“你当前有 N 个委托任务待处理。”说明。

## 比较历史

1. 初次实现发现摘要两列之间出现重复竖线（P2）。移除“下一步建议”左侧边框，仅保留总任务摘要右侧分隔线。
2. 复查发现“我的任务”和“下一步建议”文字周围缺少完整内边距（P2）。为两个摘要内容块补齐桌面端和移动端左右/底部 padding。
3. 修复后重新捕获 Swiss 桌面/移动截图，并更新十套主题的受影响首页与个人菜单视觉基线；完整视觉场景 22/22 通过。

## Findings

无可执行的 P0、P1 或 P2 问题。

### Follow-up Polish

- [P3] 生成稿的标题视觉字号略大于现有 token 计算结果；当前实现优先保持十主题与移动端的本地字体、响应式和既有字阶契约，可在后续单独调整首页标题 token。

## Implementation Checklist

- [x] 方案一桌面左主列 / 右状态轨道
- [x] 总任务摘要、动态说明和主 CTA
- [x] 移动端摘要堆叠与状态两列
- [x] 状态快捷入口与 hash 路由保持工作
- [x] 十主题视觉基线更新
- [x] 行为、视觉和对照检查完成

final result: passed
