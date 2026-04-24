export function getPopupActions(selection) {
  if (!selection?.text?.trim()) return []

  return [
    {
      id: "spotlight-notes-copy",
      label: "复制为检索词",
      description: "把当前划词复制到剪贴板，便于继续检索",
      kind: "copy-text",
    },
  ]
}

export async function searchSpotlight(query) {
  if (!query.trim()) return []

  return [
    {
      id: `spotlight-notes-${query}`,
      title: `示例插件结果：${query}`,
      subtitle: "来自 spotlight-notes 示例插件",
      source: "plugin",
      pluginId: "spotlight-notes",
    },
  ]
}
