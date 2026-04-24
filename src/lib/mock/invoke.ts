import { nanoid } from "nanoid"
import {
  MOCK_PROJECTS,
  DEFAULT_SETTINGS,
  MOCK_ITEMS,
  MOCK_PLUGIN_ENTRY_CODES,
  MOCK_PLUGINS,
  MOCK_STICKIES,
} from "@/lib/mock/data"
import { emitMockEvent } from "@/lib/mock/events"
import type {
  AppSettings,
  CreateProjectPayload,
  Item,
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
import { itemMatchesQuery } from "@/utils/search"

const store: {
  items: Item[]
  projects: Project[]
  settings: AppSettings
  plugins: PluginInfo[]
  stickies: StickyState[]
  screenshotSession: ScreenshotSession | null
} = {
  items: [...MOCK_ITEMS],
  projects: [...MOCK_PROJECTS],
  settings: { ...DEFAULT_SETTINGS },
  plugins: [...MOCK_PLUGINS],
  stickies: [...MOCK_STICKIES],
  screenshotSession: null,
}

function sortItems(items: Item[]) {
  return [...items].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  )
}

export async function mockInvoke<T>(cmd: string, args?: object): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 120))

  switch (cmd) {
    case "list_items":
      return sortItems(store.items) as T
    case "list_projects":
      return [...store.projects] as T
    case "save_item": {
      const payload = args as unknown as SaveItemPayload
      const timestamp = new Date().toISOString()
      const item: Item = {
        id: nanoid(),
        type: payload.type,
        text: payload.text,
        source: payload.source,
        context: payload.context,
        createdAt: timestamp,
        updatedAt: timestamp,
        completed: false,
        inbox: true,
        tags: payload.tags ?? [],
        remindAt: payload.remindAt,
        aiIntent: payload.aiIntent,
      }
      store.items.unshift(item)
      emitMockEvent("items-changed", { type: "saved", itemId: item.id })
      emitMockEvent("item-saved", item)
      return item as T
    }
    case "update_item": {
      const payload = args as unknown as UpdateItemPayload
      store.items = store.items.map((item) =>
        item.id === payload.id
          ? {
              ...item,
              ...payload,
              projectId:
                payload.projectId === null ? undefined : payload.projectId ?? item.projectId,
              remindAt:
                payload.remindAt === null ? undefined : payload.remindAt ?? item.remindAt,
              updatedAt: new Date().toISOString(),
            }
          : item,
      )
      emitMockEvent("items-changed", { type: "updated", itemId: payload.id })
      return undefined as T
    }
    case "delete_item": {
      const payload = (args ?? {}) as { id?: string }
      const id = String(payload.id ?? "")
      store.items = store.items.filter((item) => item.id !== id)
      emitMockEvent("items-changed", { type: "deleted", itemId: id })
      return undefined as T
    }
    case "search_items": {
      const payload = (args ?? {}) as { query?: string }
      const query = String(payload.query ?? "")
      return sortItems(
        store.items.filter((item) => itemMatchesQuery(item, query)),
      ) as T
    }
    case "create_project": {
      const payload = ((args ?? {}) as { payload?: CreateProjectPayload }).payload
      const project: Project = {
        id: nanoid(),
        name: String(payload?.name ?? ""),
        color: String(payload?.color ?? "#2563eb"),
        description: payload?.description,
        createdAt: new Date().toISOString(),
      }
      store.projects.push(project)
      emitMockEvent("projects-changed", { type: "created", projectId: project.id })
      return project as T
    }
    case "update_project": {
      const payload = ((args ?? {}) as { payload?: UpdateProjectPayload }).payload
      if (!payload) {
        throw new Error("[Mock] Missing update_project payload")
      }
      const project = store.projects.find((entry) => entry.id === payload.id)
      if (!project) {
        throw new Error("[Mock] Project not found")
      }
      if (payload.name !== undefined) project.name = payload.name
      if (payload.color !== undefined) project.color = payload.color
      if (payload.description !== undefined) {
        project.description = payload.description ?? undefined
      }
      emitMockEvent("projects-changed", { type: "updated", projectId: project.id })
      return { ...project } as T
    }
    case "delete_project": {
      const payload = (args ?? {}) as { id?: string }
      const id = String(payload.id ?? "")
      store.projects = store.projects.filter((project) => project.id !== id)
      store.items = store.items.map((item) =>
        item.projectId === id
          ? {
              ...item,
              projectId: undefined,
              inbox: true,
              updatedAt: new Date().toISOString(),
            }
          : item,
      )
      emitMockEvent("projects-changed", { type: "deleted", projectId: id })
      emitMockEvent("items-changed", { type: "project_deleted", itemId: id })
      return undefined as T
    }
    case "analyze_intent":
      return {
        intent: "general",
        confidence: 0.5,
        suggestion: "建议先加入 Inbox，再根据项目夹继续整理。",
      } as T
    case "get_settings":
      return { ...store.settings } as T
    case "save_settings":
      store.settings = { ...store.settings, ...(args as Partial<AppSettings>) }
      localStorage.setItem("app-settings", JSON.stringify(store.settings))
      return undefined as T
    case "list_ocr_providers": {
      const providers: OcrProviderInfo[] = [
        {
          id: "windows_ocr",
          name: "Windows OCR",
          runtime: "rust",
          available: true,
          supportsOffline: true,
          supportsLanguages: ["auto", "zh-CN", "en"],
          priority: 1,
        },
        {
          id: "tesseract_cli",
          name: "Tesseract CLI",
          runtime: "rust",
          available: Boolean(store.settings.ocrTesseractPath),
          supportsOffline: true,
          supportsLanguages: ["auto", "eng", "chi_sim"],
          priority: 2,
          reason: store.settings.ocrTesseractPath
            ? undefined
            : "Mock 环境：设置 Tesseract 路径后视为可用",
        },
        {
          id: "tesseract_js",
          name: "Tesseract.js",
          runtime: "frontend",
          available: store.settings.ocrEnableFrontendProviders,
          supportsOffline: true,
          supportsLanguages: ["auto", "eng", "chi_sim"],
          priority: 3,
        },
        {
          id: "ocr_browser_paddle",
          name: "OCR Browser Paddle",
          runtime: "frontend",
          available: store.settings.ocrEnableFrontendProviders,
          supportsOffline: true,
          supportsLanguages: ["zh-CN", "en"],
          priority: 4,
        },
        {
          id: "ocr_space",
          name: "OCR.space",
          runtime: "cloud",
          available: Boolean(store.settings.ocrCloudApiKey),
          supportsOffline: false,
          supportsLanguages: ["auto", "eng", "chs"],
          priority: 5,
          reason: store.settings.ocrCloudApiKey
            ? undefined
            : "Mock 环境：配置 OCR.space API Key 后可用",
        },
      ]
      return providers as T
    }
    case "start_screenshot_ocr": {
      const payload = ((args ?? {}) as { payload?: StartScreenshotOcrPayload }).payload
      const provider = payload?.providerId ?? store.settings.ocrProvider
      const result: OcrResult = {
        provider,
        runtime:
          provider === "windows_ocr" || provider === "tesseract_cli"
            ? "rust"
            : provider === "ocr_space"
              ? "cloud"
              : "frontend",
        status: "success",
        text: "TextClip OCR Mock Result\n支持多 OCR Provider 切换。",
        durationMs: 420,
        fallbackChain: [],
      }
      if (payload?.emitSelection ?? true) {
        const selection: TextSelectedPayload = {
          text: result.text,
          x: payload?.x ?? 220,
          y: payload?.y ?? 180,
          source: { type: "unknown", title: "OCR Mock" },
          context: { before: "", after: "" },
          ocr: {
            provider: result.provider,
            runtime: result.runtime,
            status: result.status,
            durationMs: result.durationMs,
          },
        }
        emitMockEvent("text-selected", selection)
      }
      return result as T
    }
    case "start_screenshot_selection": {
      const session: ScreenshotSession = {
        imageDataUrl:
          "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='720' viewBox='0 0 1280 720'><rect width='1280' height='720' fill='%23f8fafc'/><rect x='40' y='40' width='1200' height='640' rx='24' fill='%23e2e8f0'/><text x='90' y='170' font-size='52' font-family='Arial' fill='%230f172a'>TextClip Screenshot Mock</text><text x='90' y='250' font-size='34' font-family='Arial' fill='%23334155'>Drag to select a region for OCR.</text></svg>",
        originX: 0,
        originY: 0,
        width: 1280,
        height: 720,
        displays: [
          {
            id: "display-1",
            x: 0,
            y: 0,
            width: 1280,
            height: 720,
            isPrimary: true,
          },
        ],
      }
      store.screenshotSession = session
      emitMockEvent("screenshot-selection-started", session)
      return session as T
    }
    case "get_pending_screenshot_session":
      return store.screenshotSession as T
    case "cancel_screenshot_selection":
      store.screenshotSession = null
      return undefined as T
    case "list_plugins":
      return [...store.plugins] as T
    case "toggle_plugin": {
      const payload = (args ?? {}) as { id?: string; enabled?: boolean }
      const id = String(payload.id ?? "")
      const enabled = Boolean(payload.enabled)
      store.plugins = store.plugins.map((plugin) =>
        plugin.id === id ? { ...plugin, enabled } : plugin,
      )
      return undefined as T
    }
    case "get_plugin_entry_code": {
      const payload = (args ?? {}) as { id?: string }
      const id = String(payload.id ?? "")
      const code = MOCK_PLUGIN_ENTRY_CODES[id]
      if (!code) {
        throw new Error(`[Mock] Plugin entry not found: ${id}`)
      }
      return { id, code } as T
    }
    case "create_sticky": {
      const payload = (args ?? {}) as { text?: string }
      const sticky: StickyState = {
        id: nanoid(),
        text: String(payload.text ?? ""),
        x: 80,
        y: 80,
        visible: true,
      }
      store.stickies.push(sticky)
      return { windowId: sticky.id } as T
    }
    case "close_sticky": {
      const payload = (args ?? {}) as { windowId?: string }
      const windowId = String(payload.windowId ?? "")
      store.stickies = store.stickies.map((sticky) =>
        sticky.id === windowId ? { ...sticky, visible: false } : sticky,
      )
      return undefined as T
    }
    case "update_sticky_position": {
      const payload = (args ?? {}) as { id?: string; x?: number; y?: number }
      store.stickies = store.stickies.map((sticky) =>
        sticky.id === payload.id
          ? { ...sticky, x: Number(payload.x ?? sticky.x), y: Number(payload.y ?? sticky.y) }
          : sticky,
      )
      return undefined as T
    }
    case "list_stickies":
      return store.stickies.filter((sticky) => sticky.visible) as T
    case "remember_selection":
    case "show_overlay_window":
    case "hide_overlay_window":
    case "show_screenshot_window":
    case "hide_screenshot_window":
    case "show_task_manager_window": {
      const payload = (args ?? {}) as TaskManagerFocusPayload
      if (payload.itemId) {
        emitMockEvent("task-manager-focus-item", payload)
      }
      return undefined as T
    }
    case "show_spotlight":
    case "hide_spotlight":
      return undefined as T
    default:
      throw new Error(`[Mock] Unknown command: ${cmd}`)
  }
}
