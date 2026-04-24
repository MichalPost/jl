import { z } from "zod"

export const sourceSchema = z.object({
  type: z.enum(["browser", "app", "unknown"]),
  url: z.string().optional(),
  title: z.string().optional(),
  appName: z.string().optional(),
})

export const contextSchema = z.object({
  before: z.string(),
  after: z.string(),
})

export const intentSchema = z.object({
  intent: z.enum(["schedule", "translate", "bug", "vocabulary", "general"]),
  confidence: z.number(),
  suggestion: z.string().optional(),
  translation: z.string().optional(),
})

export const itemSchema = z.object({
  id: z.string(),
  type: z.enum(["todo", "note", "highlight", "read_later", "sticky"]),
  text: z.string(),
  source: sourceSchema,
  context: contextSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  completed: z.boolean(),
  inbox: z.boolean(),
  projectId: z.string().optional(),
  tags: z.array(z.string()),
  remindAt: z.string().optional(),
  aiIntent: intentSchema.optional(),
})

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
})

export const pluginInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  extensionPoints: z.array(
    z.enum(["popup-action", "post-save", "spotlight-source"]),
  ),
  enabled: z.boolean(),
  loadError: z.string().optional(),
})

export const pluginEntryCodeSchema = z.object({
  id: z.string(),
  code: z.string(),
})

export const settingsSchema = z.object({
  aiApiKey: z.string().optional(),
  aiApiEndpoint: z.string(),
  aiModel: z.string(),
  screenshotHotkey: z.string(),
  spotlightHotkey: z.string(),
  quickSaveHotkey: z.string(),
  pluginDir: z.string(),
  theme: z.string(),
  customPrimaryColor: z.string().optional(),
  followSystemTheme: z.boolean(),
  ocrProvider: z.enum([
    "windows_ocr",
    "tesseract_cli",
    "tesseract_js",
    "ocr_browser_paddle",
    "ocr_space",
  ]),
  ocrFallbackOrder: z.array(
    z.enum([
      "windows_ocr",
      "tesseract_cli",
      "tesseract_js",
      "ocr_browser_paddle",
      "ocr_space",
    ]),
  ),
  ocrLanguage: z.string(),
  ocrTesseractPath: z.string().optional(),
  ocrCloudProvider: z.literal("ocr_space").optional(),
  ocrCloudApiKey: z.string().optional(),
  ocrEnableFrontendProviders: z.boolean(),
  ocrPreferredOfflineProvider: z
    .enum([
      "windows_ocr",
      "tesseract_cli",
      "tesseract_js",
      "ocr_browser_paddle",
      "ocr_space",
    ])
    .optional(),
})
