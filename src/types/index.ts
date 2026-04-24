export type ItemType = "todo" | "note" | "highlight" | "read_later" | "sticky"

export interface Source {
  type: "browser" | "app" | "unknown"
  url?: string
  title?: string
  appName?: string
}

export interface Context {
  before: string
  after: string
}

export type IntentType =
  | "schedule"
  | "translate"
  | "bug"
  | "vocabulary"
  | "general"

export interface IntentResult {
  intent: IntentType
  confidence: number
  suggestion?: string
  translation?: string
}

export type OcrProviderId =
  | "windows_ocr"
  | "tesseract_cli"
  | "tesseract_js"
  | "ocr_browser_paddle"
  | "ocr_space"

export type OcrRuntime = "rust" | "frontend" | "cloud"

export interface OcrSelectionMetadata {
  provider: string
  runtime: OcrRuntime
  status: "success" | "empty" | "error"
  durationMs: number
}

export interface OcrProviderInfo {
  id: OcrProviderId
  name: string
  runtime: OcrRuntime
  available: boolean
  supportsOffline: boolean
  supportsLanguages: string[]
  priority: number
  reason?: string
}

export interface OcrResult {
  provider: string
  runtime: OcrRuntime
  status: "success" | "empty" | "error"
  text: string
  durationMs: number
  errorMessage?: string
  fallbackChain: string[]
}

export interface StartScreenshotOcrPayload {
  providerId?: OcrProviderId
  language?: string
  disableFallback?: boolean
  emitSelection?: boolean
  imageDataUrl?: string
  imagePath?: string
  x?: number
  y?: number
}

export interface ScreenshotSession {
  imageDataUrl: string
  originX: number
  originY: number
  width: number
  height: number
  displays: ScreenshotDisplay[]
}

export interface ScreenshotDisplay {
  id: string
  x: number
  y: number
  width: number
  height: number
  isPrimary: boolean
}

export interface Item {
  id: string
  type: ItemType
  text: string
  source: Source
  context: Context
  createdAt: string
  updatedAt: string
  completed: boolean
  inbox: boolean
  projectId?: string
  tags: string[]
  remindAt?: string
  aiIntent?: IntentResult
}

export interface Project {
  id: string
  name: string
  color: string
  description?: string
  createdAt: string
}

export interface CreateProjectPayload {
  name: string
  color: string
  description?: string
}

export interface UpdateProjectPayload {
  id: string
  name?: string
  color?: string
  description?: string | null
}

export interface StickyState {
  id: string
  text: string
  x: number
  y: number
  visible: boolean
}

export type PluginExtensionPoint =
  | "popup-action"
  | "post-save"
  | "spotlight-source"

export interface PluginManifest {
  id: string
  name: string
  version: string
  extensionPoints: PluginExtensionPoint[]
}

export interface PluginInfo extends PluginManifest {
  enabled: boolean
  loadError?: string
}

export interface PluginEntryCode {
  id: string
  code: string
}

export interface PluginSpotlightResult {
  id: string
  title: string
  subtitle: string
  source: "plugin"
  pluginId: string
  itemId?: string
}

export interface TaskManagerFocusPayload {
  itemId?: string
}

export interface AppSettings {
  aiApiKey?: string
  aiApiEndpoint: string
  aiModel: string
  screenshotHotkey: string
  spotlightHotkey: string
  quickSaveHotkey: string
  pluginDir: string
  theme: string
  customPrimaryColor?: string
  followSystemTheme: boolean
  ocrProvider: OcrProviderId
  ocrFallbackOrder: OcrProviderId[]
  ocrLanguage: string
  ocrTesseractPath?: string
  ocrCloudProvider?: "ocr_space"
  ocrCloudApiKey?: string
  ocrEnableFrontendProviders: boolean
  ocrPreferredOfflineProvider?: OcrProviderId
}

export interface TextSelectedPayload {
  text: string
  x: number
  y: number
  source: Source
  context: Context
  ocr?: OcrSelectionMetadata
}

export interface SaveItemPayload {
  type: ItemType
  text: string
  source: Source
  context: Context
  tags?: string[]
  remindAt?: string
  aiIntent?: IntentResult
}

export interface UpdateItemPayload {
  id: string
  text?: string
  completed?: boolean
  inbox?: boolean
  projectId?: string | null
  tags?: string[]
  remindAt?: string | null
  type?: ItemType
  source?: Source
  context?: Context
  updatedAt?: string
  createdAt?: string
  aiIntent?: IntentResult
}
