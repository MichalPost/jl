import type {
  AppSettings,
  CreateProjectPayload,
  Item,
  PluginEntryCode,
  OcrProviderInfo,
  OcrResult,
  PluginInfo,
  Project,
  SaveItemPayload,
  ScreenshotSession,
  StartScreenshotOcrPayload,
  StickyState,
  TaskManagerFocusPayload,
  TextSelectedPayload,
  UpdateItemPayload,
  UpdateProjectPayload,
} from "@/types"

export type EventCallback<T> = (payload: T) => void
export type UnlistenFn = () => void

export function isTauriEnvironment() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export async function invoke<T>(cmd: string, args?: object): Promise<T> {
  if (isTauriEnvironment()) {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core")
    return tauriInvoke<T>(cmd, args as Record<string, unknown> | undefined)
  }

  const { mockInvoke } = await import("./mock/invoke")
  return mockInvoke<T>(cmd, args)
}

async function withCurrentWindow<T>(
  action: (windowApi: {
    label: string
    close: () => Promise<void>
    startDragging: () => Promise<void>
    outerPosition: () => Promise<{ x: number; y: number }>
  }) => Promise<T>,
): Promise<T | null> {
  if (!isTauriEnvironment()) {
    return null
  }

  const [{ getCurrentWebviewWindow }, { getCurrentWindow }] = await Promise.all([
    import("@tauri-apps/api/webviewWindow"),
    import("@tauri-apps/api/window"),
  ])

  const webviewWindow = getCurrentWebviewWindow()
  const currentWindow = getCurrentWindow()
  return action({
    label: webviewWindow.label,
    close: () => currentWindow.close(),
    startDragging: () => currentWindow.startDragging(),
    outerPosition: async () => {
      const position = await currentWindow.outerPosition()
      return { x: position.x, y: position.y }
    },
  })
}

function normalizeSettings(raw: Record<string, unknown>): AppSettings {
  return {
    aiApiKey:
      (raw.aiApiKey as string | undefined) ??
      (raw.ai_api_key as string | undefined),
    aiApiEndpoint:
      (raw.aiApiEndpoint as string | undefined) ??
      (raw.ai_api_endpoint as string | undefined) ??
      "",
    aiModel:
      (raw.aiModel as string | undefined) ??
      (raw.ai_model as string | undefined) ??
      "",
    screenshotHotkey:
      (raw.screenshotHotkey as string | undefined) ??
      (raw.screenshot_hotkey as string | undefined) ??
      "",
    spotlightHotkey:
      (raw.spotlightHotkey as string | undefined) ??
      (raw.spotlight_hotkey as string | undefined) ??
      "",
    quickSaveHotkey:
      (raw.quickSaveHotkey as string | undefined) ??
      (raw.quick_save_hotkey as string | undefined) ??
      "",
    pluginDir:
      (raw.pluginDir as string | undefined) ??
      (raw.plugin_dir as string | undefined) ??
      "",
    theme: (raw.theme as string | undefined) ?? "",
    customPrimaryColor:
      (raw.customPrimaryColor as string | undefined) ??
      (raw.custom_primary_color as string | undefined),
    followSystemTheme:
      (raw.followSystemTheme as boolean | undefined) ??
      (raw.follow_system_theme as boolean | undefined) ??
      false,
    ocrProvider:
      (raw.ocrProvider as AppSettings["ocrProvider"] | undefined) ??
      (raw.ocr_provider as AppSettings["ocrProvider"] | undefined) ??
      "windows_ocr",
    ocrFallbackOrder:
      (raw.ocrFallbackOrder as AppSettings["ocrFallbackOrder"] | undefined) ??
      (raw.ocr_fallback_order as AppSettings["ocrFallbackOrder"] | undefined) ??
      ["windows_ocr", "tesseract_cli", "tesseract_js", "ocr_browser_paddle", "ocr_space"],
    ocrLanguage:
      (raw.ocrLanguage as string | undefined) ??
      (raw.ocr_language as string | undefined) ??
      "auto",
    ocrTesseractPath:
      (raw.ocrTesseractPath as string | undefined) ??
      (raw.ocr_tesseract_path as string | undefined),
    ocrCloudProvider:
      (raw.ocrCloudProvider as AppSettings["ocrCloudProvider"] | undefined) ??
      (raw.ocr_cloud_provider as AppSettings["ocrCloudProvider"] | undefined),
    ocrCloudApiKey:
      (raw.ocrCloudApiKey as string | undefined) ??
      (raw.ocr_cloud_api_key as string | undefined),
    ocrEnableFrontendProviders:
      (raw.ocrEnableFrontendProviders as boolean | undefined) ??
      (raw.ocr_enable_frontend_providers as boolean | undefined) ??
      true,
    ocrPreferredOfflineProvider:
      (raw.ocrPreferredOfflineProvider as
        | AppSettings["ocrPreferredOfflineProvider"]
        | undefined) ??
      (raw.ocr_preferred_offline_provider as
        | AppSettings["ocrPreferredOfflineProvider"]
        | undefined),
  }
}

export async function listen<T>(
  event: string,
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  if (isTauriEnvironment()) {
    const { listen: tauriListen } = await import("@tauri-apps/api/event")
    const unlisten = await tauriListen<T>(event, (eventPayload) =>
      handler(eventPayload.payload),
    )
    return () => void unlisten()
  }

  const { mockListen } = await import("./mock/events")
  return mockListen<T>(event, handler)
}

export const tauriApi = {
  saveItem: (payload: SaveItemPayload) => invoke<Item>("save_item", payload),
  updateItem: (payload: UpdateItemPayload) =>
    invoke<void>("update_item", payload),
  deleteItem: (id: string) => invoke<void>("delete_item", { id }),
  listItems: () => invoke<Item[]>("list_items"),
  listProjects: () => invoke<Project[]>("list_projects"),
  createProject: (payload: CreateProjectPayload) =>
    invoke<Project>("create_project", { payload }),
  updateProject: (payload: UpdateProjectPayload) =>
    invoke<Project>("update_project", { payload }),
  deleteProject: (id: string) => invoke<void>("delete_project", { id }),
  searchItems: (query: string) => invoke<Item[]>("search_items", { query }),
  analyzeIntent: (text: string) => invoke("analyze_intent", { text }),
  getSettings: async () =>
    normalizeSettings((await invoke<Record<string, unknown>>("get_settings")) ?? {}),
  saveSettings: (payload: Partial<AppSettings>) =>
    invoke<void>("save_settings", payload),
  listOcrProviders: () => invoke<OcrProviderInfo[]>("list_ocr_providers"),
  startScreenshotOcr: (payload?: StartScreenshotOcrPayload) =>
    invoke<OcrResult>("start_screenshot_ocr", { payload }),
  startScreenshotSelection: () =>
    invoke<ScreenshotSession>("start_screenshot_selection"),
  getPendingScreenshotSession: () =>
    invoke<ScreenshotSession | null>("get_pending_screenshot_session"),
  cancelScreenshotSelection: () => invoke<void>("cancel_screenshot_selection"),
  listPlugins: () => invoke<PluginInfo[]>("list_plugins"),
  togglePlugin: (id: string, enabled: boolean) =>
    invoke<void>("toggle_plugin", { id, enabled }),
  getPluginEntryCode: (id: string) =>
    invoke<PluginEntryCode>("get_plugin_entry_code", { id }),
  createSticky: (text: string) =>
    invoke<{ windowId: string }>("create_sticky", { text }),
  listStickies: () => invoke<StickyState[]>("list_stickies"),
  closeSticky: (windowId: string) => invoke<void>("close_sticky", { windowId }),
  updateStickyPosition: (id: string, x: number, y: number) =>
    invoke<void>("update_sticky_position", { id, x, y }),
  rememberSelection: (payload: TextSelectedPayload) =>
    invoke<void>("remember_selection", { payload }),
  showOverlayWindow: () => invoke<void>("show_overlay_window"),
  hideOverlayWindow: () => invoke<void>("hide_overlay_window"),
  showScreenshotWindow: () => invoke<void>("show_screenshot_window"),
  hideScreenshotWindow: () => invoke<void>("hide_screenshot_window"),
  showTaskManagerWindow: (itemId?: string) =>
    invoke<void>("show_task_manager_window", itemId ? { itemId } : undefined),
  showSpotlight: () => invoke<void>("show_spotlight"),
  hideSpotlight: () => invoke<void>("hide_spotlight"),
  getCurrentWindowLabel: () => withCurrentWindow(async (windowApi) => windowApi.label),
  closeCurrentWindow: () => withCurrentWindow(async (windowApi) => windowApi.close()),
  startCurrentWindowDragging: () =>
    withCurrentWindow(async (windowApi) => windowApi.startDragging()),
  getCurrentWindowOuterPosition: () =>
    withCurrentWindow(async (windowApi) => windowApi.outerPosition()),
}

export type AppEvents = {
  "text-selected": TextSelectedPayload
  "items-changed": { type: string; itemId: string }
  "projects-changed": { type: string; projectId: string }
  "item-saved": Item
  "reminder-triggered": { itemId: string }
  "task-manager-focus-item": TaskManagerFocusPayload
  "quick-save-result": {
    status: "saved"
    itemId: string
    message: string
  }
  "screenshot-selection-started": ScreenshotSession
  "overlay-dismissed": Record<string, never>
}
