import { toast } from "sonner"
import { tauriApi } from "@/lib/tauri"
import type {
  Item,
  ItemType,
  PluginEntryCode,
  PluginInfo,
  PluginSpotlightResult,
  TextSelectedPayload,
} from "@/types"

export type PluginPopupAction =
  | {
      id: string
      label: string
      description?: string
      kind: "save"
      itemType: ItemType
    }
  | {
      id: string
      label: string
      description?: string
      kind: "sticky" | "show-task-manager" | "copy-text"
    }

export interface PluginExecutionContext {
  toast: (title: string, description?: string) => void
  openTaskManager: (itemId?: string) => Promise<void>
}

interface PluginModule {
  getPopupActions?: (
    selection: TextSelectedPayload,
  ) => PluginPopupAction[] | Promise<PluginPopupAction[]>
  onPostSave?: (item: Item, api: PluginExecutionContext) => Promise<void> | void
  searchSpotlight?: (
    query: string,
    api: PluginExecutionContext,
  ) => PluginSpotlightResult[] | Promise<PluginSpotlightResult[]>
  onSelectSpotlightResult?: (
    result: PluginSpotlightResult,
    api: PluginExecutionContext,
  ) => Promise<void> | void
}

const pluginModuleCache = new Map<string, Promise<PluginModule>>()

function createExecutionContext(): PluginExecutionContext {
  return {
    toast: (title, description) => {
      toast.success(title, description ? { description } : undefined)
    },
    openTaskManager: async (itemId) => {
      await tauriApi.showTaskManagerWindow(itemId)
    },
  }
}

async function importPluginEntry(entry: PluginEntryCode): Promise<PluginModule> {
  const blob = new Blob([entry.code], { type: "text/javascript" })
  const blobUrl = URL.createObjectURL(blob)
  try {
    return (await import(/* @vite-ignore */ blobUrl)) as PluginModule
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

async function loadPluginModule(plugin: PluginInfo): Promise<PluginModule | null> {
  if (!plugin.enabled || plugin.loadError) {
    return null
  }

  if (!pluginModuleCache.has(plugin.id)) {
    pluginModuleCache.set(
      plugin.id,
      tauriApi.getPluginEntryCode(plugin.id).then(importPluginEntry),
    )
  }

  try {
    return await pluginModuleCache.get(plugin.id)!
  } catch (error) {
    console.error("[plugin-load]", plugin.id, error)
    pluginModuleCache.delete(plugin.id)
    return null
  }
}

async function getEnabledPlugins(extensionPoint: PluginInfo["extensionPoints"][number]) {
  const plugins = await tauriApi.listPlugins()
  return plugins.filter(
    (plugin) =>
      plugin.enabled &&
      !plugin.loadError &&
      plugin.extensionPoints.includes(extensionPoint),
  )
}

export function invalidatePluginRuntimeCache(pluginId?: string) {
  if (pluginId) {
    pluginModuleCache.delete(pluginId)
    return
  }

  pluginModuleCache.clear()
}

export async function getPopupPluginActions(selection: TextSelectedPayload) {
  const plugins = await getEnabledPlugins("popup-action")
  const actions = await Promise.all(
    plugins.map(async (plugin) => {
      const mod = await loadPluginModule(plugin)
      if (!mod?.getPopupActions) {
        return []
      }

      try {
        return await mod.getPopupActions(selection)
      } catch (error) {
        console.error("[plugin-popup-action]", plugin.id, error)
        return []
      }
    }),
  )

  return actions.flat()
}

export async function runPostSavePlugins(item: Item) {
  const plugins = await getEnabledPlugins("post-save")
  const api = createExecutionContext()

  await Promise.all(
    plugins.map(async (plugin) => {
      const mod = await loadPluginModule(plugin)
      if (!mod?.onPostSave) {
        return
      }

      try {
        await mod.onPostSave(item, api)
      } catch (error) {
        console.error("[plugin-post-save]", plugin.id, error)
      }
    }),
  )
}

export async function searchPluginSpotlight(query: string) {
  const plugins = await getEnabledPlugins("spotlight-source")
  const api = createExecutionContext()

  const results = await Promise.all(
    plugins.map(async (plugin) => {
      const mod = await loadPluginModule(plugin)
      if (!mod?.searchSpotlight) {
        return []
      }

      try {
        const result = await mod.searchSpotlight(query, api)
        return result.map((item) => ({
          ...item,
          source: "plugin" as const,
          pluginId: item.pluginId || plugin.id,
        }))
      } catch (error) {
        console.error("[plugin-spotlight]", plugin.id, error)
        return []
      }
    }),
  )

  return results.flat()
}

export async function runPluginSpotlightSelection(result: PluginSpotlightResult) {
  const plugins = await tauriApi.listPlugins()
  const plugin = plugins.find((item) => item.id === result.pluginId)
  if (!plugin) {
    return
  }

  const mod = await loadPluginModule(plugin)
  if (!mod?.onSelectSpotlightResult) {
    return
  }

  try {
    await mod.onSelectSpotlightResult(result, createExecutionContext())
  } catch (error) {
    console.error("[plugin-spotlight-select]", plugin.id, error)
  }
}
