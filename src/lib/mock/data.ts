import type { AppSettings, Item, PluginInfo, Project, StickyState } from "@/types"

const now = new Date().toISOString()

export const MOCK_ITEMS: Item[] = [
  {
    id: "item-1",
    type: "todo",
    text: "整理 AI API 接入方案，补充错误处理和降级流程。",
    source: {
      type: "browser",
      title: "设计文档",
      url: "https://example.com/design",
    },
    context: { before: "前文示例。", after: "后文示例。" },
    createdAt: now,
    updatedAt: now,
    completed: false,
    inbox: true,
    tags: ["规划", "AI"],
  },
  {
    id: "item-2",
    type: "note",
    text: "Popup 需要支持玻璃拟态样式和外部点击关闭。",
    source: { type: "unknown", title: "来源未知" },
    context: { before: "", after: "" },
    createdAt: now,
    updatedAt: now,
    completed: false,
    inbox: true,
    tags: ["UI"],
  },
  {
    id: "item-3",
    type: "highlight",
    text: "响应式策略要从一开始考虑，而不是等桌面 UI 做完后再补救。",
    source: {
      type: "browser",
      title: "Tailwind Responsive Design",
      url: "https://tailwindcss.com/docs/responsive-design",
    },
    context: {
      before: "Tailwind 推荐采用 mobile-first 的断点策略。",
      after: "这样浏览器开发模式和桌面窗口缩放都能共享一套布局逻辑。",
    },
    createdAt: now,
    updatedAt: now,
    completed: false,
    inbox: true,
    tags: ["响应式", "前端"],
  },
  {
    id: "item-4",
    type: "note",
    text: "已经归档到研究摘录里的条目应该在项目页看到。",
    source: { type: "unknown", title: "项目归档示例" },
    context: { before: "", after: "" },
    createdAt: now,
    updatedAt: now,
    completed: false,
    inbox: false,
    projectId: "p2",
    tags: ["项目"],
  },
]

export const MOCK_PROJECTS: Project[] = [
  {
    id: "p1",
    name: "产品策略",
    color: "#2563eb",
    description: "收纳产品方向、需求结构和策略相关摘录。",
    createdAt: now,
  },
  {
    id: "p2",
    name: "研究摘录",
    color: "#0f766e",
    description: "放研究材料、资料梳理和阅读笔记。",
    createdAt: now,
  },
  {
    id: "p3",
    name: "Bug 待办",
    color: "#dc2626",
    description: "集中处理待修复问题和技术债。",
    createdAt: now,
  },
]

export const DEFAULT_SETTINGS: AppSettings = {
  aiApiEndpoint: "https://api.openai.com/v1/chat/completions",
  aiModel: "gpt-4.1-mini",
  screenshotHotkey: "Ctrl+Shift+S",
  spotlightHotkey: "Alt+Space",
  quickSaveHotkey: "Ctrl+D",
  pluginDir: "plugins",
  theme: "snow",
  followSystemTheme: false,
  ocrProvider: "windows_ocr",
  ocrFallbackOrder: [
    "windows_ocr",
    "tesseract_cli",
    "tesseract_js",
    "ocr_browser_paddle",
    "ocr_space",
  ],
  ocrLanguage: "auto",
  ocrCloudProvider: "ocr_space",
  ocrEnableFrontendProviders: true,
  ocrPreferredOfflineProvider: "windows_ocr",
}

export const MOCK_PLUGINS: PluginInfo[] = [
  {
    id: "demo-popup-helper",
    name: "Demo Popup Helper",
    version: "0.1.0",
    extensionPoints: ["popup-action", "post-save", "spotlight-source"],
    enabled: true,
  },
]

export const MOCK_PLUGIN_ENTRY_CODES: Record<string, string> = {
  "demo-popup-helper": `
export function getPopupActions(selection) {
  if (!selection?.text?.trim()) return []
  return [
    {
      id: "demo-copy",
      label: "复制到剪贴板",
      description: "把当前划词内容复制出来",
      kind: "copy-text"
    },
    {
      id: "demo-open",
      label: "打开主窗口",
      description: "直接打开任务面板",
      kind: "show-task-manager"
    }
  ]
}

export async function onPostSave(item, api) {
  api.toast("插件已收到保存事件", \`\${item.text.slice(0, 18)}...\`)
}

export async function searchSpotlight(query) {
  if (!query.trim()) return []
  return [
    {
      id: "plugin-result-" + query,
      title: "插件结果：" + query,
      subtitle: "来自 Demo Popup Helper",
      source: "plugin",
      pluginId: "demo-popup-helper"
    }
  ]
}

export async function onSelectSpotlightResult(result, api) {
  api.toast("插件结果已选中", result.title)
}
`,
}

export const MOCK_STICKIES: StickyState[] = [
  { id: "sticky-1", text: "桌面便利贴示例", x: 40, y: 120, visible: true },
]
