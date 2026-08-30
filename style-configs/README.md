# 风格配置设计说明

本目录中的每个 JavaScript 文件代表一种视觉风格。目前包含瑞士国际、粗野主义、包豪斯、Y2K / 赛博、复古终端、孟菲斯、编辑杂志、玻璃拟态、日式极简和像素 / 复古游戏界面，共 10 种。文件由 `index.html` 以固定顺序加载，在 `app.js` 初始化前调用 `GuildStyle.register` 注册配置。配置使用本地字体栈和 CSS 变量，不依赖构建工具、网络字体、图片或第三方库。

## 配置格式

每个配置文件只注册一个对象：

```js
GuildStyle.register({
  id: 'my-style',
  label: '我的风格',
  tokens: {
    '--ink': '#111111',
    '--muted': '#666666',
    '--line': '#cccccc',
    '--soft-line': '#eeeeee',
    '--paper': '#ffffff',
    '--white': '#ffffff',
    '--panel': '#f5f5f5',
    '--accent': '#111111',
    '--accent-contrast': '#ffffff',
    '--accent-soft': '#eeeeee',
    '--backdrop': 'rgba(0, 0, 0, .25)',
    '--border-width': '1px',
    '--radius-control': '0',
    '--radius-surface': '0',
    '--radius-pill': '999px',
    '--shadow': 'none',
    '--shadow-card': 'none',
    '--shadow-drawer': 'none',
    '--display-font': 'Arial, sans-serif',
    '--body-font': 'Arial, sans-serif',
    '--meta-font': 'Arial, sans-serif',
    '--max-width': '1440px'
  }
});
```

`id` 必须是唯一的 kebab-case 值，`label` 是选择器中的产品文案，`tokens` 必须完整提供全部令牌。`--display-font` 用于大标题，`--body-font` 用于正文，`--meta-font` 用于标签和元信息。字体只能写本机可用字体和安全回退字体，不要加入需要联网下载的字体地址。

## 如何新增风格

1. 复制一个配置文件，修改 `id`、`label` 和全部令牌。
2. 为三类文字选择匹配风格的本地字体栈，并保证显示字体栈与已有主题不同。
3. 在 `index.html` 的 `style-preferences.js` 后、`app.js` 前加入脚本标签。
4. 如需纹理、扫描线、几何标记或玻璃模糊，在 `styles.css` 中增加 `body[data-style='my-style']` 的装饰规则。
5. 装饰规则只能修改颜色、字体、边框、阴影、背景和伪元素，不能改变公共网格、组件顺序、主要尺寸、路由或任务行为。
6. 在 `tests/style.test.js` 中补充新 ID、脚本和主题规则的断言，然后运行测试。

## 形状和布局约束

控件统一使用 `--radius-control`，任务卡片、弹窗、抽屉和空状态统一使用 `--radius-surface`。如果主题使用圆角或方形，必须通过令牌保持全局一致；装饰性的品牌标记可以单独使用几何形状。公共页面排版由 `styles.css` 的基础规则统一提供，主题不得创建另一套页面布局。

## 验证

在项目根目录运行完整验证：

```bash
osascript -l JavaScript tests/state.test.js
osascript -l JavaScript tests/style.test.js
git diff --check
```

主题偏好保存在 `minecraft-guild-board-style`。缺失、非法或旧主题值会回退到 `swiss-international`；任务数据和当前身份保存在 `minecraft-guild-board-state`，由 `app-state.js` 单独管理。修改主题不会重置任务数据。
