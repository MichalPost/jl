# TextClip 开发与交付说明

## 本地开发

- 浏览器 mock 模式：`pnpm dev`
- 前端类型检查：`pnpm run check`
- 前端测试：`pnpm run test`
- 前端构建：`pnpm run build`
- Tauri 真机调试：`pnpm tauri dev`

## 浏览器 mock 调试

- 当前默认使用 `src/lib/mock/invoke.ts` 和 `src/lib/mock/events.ts` 提供伪 Tauri 能力。
- 可验证的主流程包括：Inbox、Overlay、Spotlight、OCR 前端 fallback、插件运行时、设置保存、响应式布局。
- 不可在 mock 模式完整验证的能力：全局快捷键、系统托盘、Windows OCR、Tesseract CLI、系统通知点击回跳、真实多窗口恢复。

## Tauri 真机调试

- Windows 优先验证：
  - 划词后 Overlay 是否定位正确
  - `Alt+Space` Spotlight 是否弹出并聚焦
  - `Ctrl+D` 快捷保存是否成功
  - OCR provider 可用性和 fallback 是否符合设置页显示
  - Reminder 到时通知与点击回跳
  - Sticky 多实例创建、关闭、重启恢复
- Rust 侧测试运行：进入 `src-tauri` 后执行 `cargo test --lib -- --nocapture`

## 插件开发

- 默认插件目录：`{app_data_dir}/plugins`
- 示例目录：
  - `plugins/demo-popup-helper`
  - `plugins/examples/spotlight-notes`
- 必需文件：
  - `manifest.json`
  - `index.js`
- `manifest.json` 最小字段：
  - `id`
  - `name`
  - `version`
  - `extensionPoints`

## 插件运行时约定

- `getPopupActions?(selection)`
- `onPostSave?(item, api)`
- `searchSpotlight?(query, api)`
- `onSelectSpotlightResult?(result, api)`

## 数据目录结构

- `items.json`
- `stickies.json`
- `settings.json`
- `plugin-state.json`
- `plugins/`

## 日志与排障

- 前端异常优先看浏览器控制台或 Tauri WebView DevTools。
- Rust 初始化、插件扫描、OCR 和通知失败会输出到终端日志。
- 设置问题先检查 `settings.json` 与前端 `localStorage.app-settings` 是否一致。

## 快捷键清单

- 截图 OCR：默认 `Ctrl+Shift+S`
- Spotlight：默认 `Alt+Space`
- 快捷保存：默认 `Ctrl+D`
