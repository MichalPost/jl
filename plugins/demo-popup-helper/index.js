export function getPopupActions(selection) {
  if (!selection?.text?.trim()) return []

  return [
    {
      id: "demo-copy",
      label: "复制到剪贴板",
      description: "把当前划词内容复制出来",
      kind: "copy-text",
    },
    {
      id: "demo-open",
      label: "打开主窗口",
      description: "直接打开任务面板",
      kind: "show-task-manager",
    },
  ]
}

export async function onPostSave(item, api) {
  api.toast("插件已收到保存事件", `${item.text.slice(0, 18)}...`)
}

export async function searchSpotlight(query) {
  if (!query.trim()) return []

  return [
    {
      id: `plugin-result-${query}`,
      title: `插件结果：${query}`,
      subtitle: "来自 Demo Popup Helper",
      source: "plugin",
      pluginId: "demo-popup-helper",
    },
  ]
}

export async function onSelectSpotlightResult(result, api) {
  api.toast("插件结果已选中", result.title)
}
