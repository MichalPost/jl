# 响应式验收基线

## 视口检查清单

- `<640px`
  - 主窗口无横向滚动
  - Overlay 主要按钮完整可点
  - Spotlight 输入框固定可见
- `640px-767px`
  - 列表卡片、设置表单、插件卡片不挤压错位
  - Header 和导航不遮挡内容
- `768px-1023px`
  - 详情区和侧栏缩放后仍能阅读与操作
  - Spotlight / Overlay 高度不会溢出窗口
- `>=1024px`
  - 三段式工作台稳定
  - Sticky、Overlay、Spotlight 视觉比例自然

## 推荐截图对象

- 主窗口 Inbox
- 设置页
- Plugins 页
- Overlay
- Spotlight

## 自动化补充

- `SearchBar`、`SearchSpotlight`、`OverlayWindow` 组件测试纳入前端基线。
- 需要真机补完的窗口级响应式行为写入手工验收清单。
