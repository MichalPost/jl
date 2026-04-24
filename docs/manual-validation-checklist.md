# TextClip 手工验收与集成回归清单

## 真实 OS 流程

- 剪贴板划词后 Overlay 正常弹出，空白文本不会误触发。
- 全局快捷键 `Ctrl+D`、`Ctrl+Shift+S`、`Alt+Space` 均可用。
- 托盘菜单可打开主窗口并保持应用驻留。
- Reminder 到时有通知；点击通知后主窗口打开并定位条目。
- Sticky 多实例可创建、拖拽、关闭；重启后仅恢复 `visible=true` 项。

## OCR 流程

- `windows_ocr` 在 Windows 上可用并成功识别中文截图。
- `tesseract_cli` 配置路径后可识别中英文。
- `tesseract.js` 可在离线状态下识别并走前端回传链路。
- `@gutenye/ocr-browser` 中文截图效果与 fallback 能正常工作。
- 当前 provider 不可用时，回退顺序与设置页显示一致。
- 取消截图、空截图、超时不会卡死流程。

## 插件与异常场景

- 扫描错误插件时主应用不崩，插件页显示 `loadError`。
- 启停插件后 Popup/Spotlight 结果即时变化。
- AI、OCR、插件执行失败时有 toast 或错误文案，不出现空白卡死。

## 浏览器 mock 响应式回归

- `<640px`：主窗口为单列，Overlay/Spotlight 主操作可见。
- `640px-767px`：列表、详情与表单不出现横向滚动。
- `768px-1023px`：中宽度下分区收缩自然，侧栏和详情不挤爆。
- `>=1024px`：三段式工作台稳定，Popup/Spotlight 最大宽高符合设计。

## 交付前记录

- 为四个视口断点记录截图或检查备注。
- 记录实际测试平台、OCR provider 配置和插件目录内容。
- 若有未覆盖真机项，明确写入交付备注。
