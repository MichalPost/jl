import { describe, expect, it } from "vitest"
import { buildFallbackOrder, makeResult } from "@/lib/ocr"
import type { AppSettings } from "@/types"

const settings: AppSettings = {
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
  ocrEnableFrontendProviders: true,
  ocrCloudProvider: "ocr_space",
  ocrPreferredOfflineProvider: "windows_ocr",
}

describe("buildFallbackOrder", () => {
  it("starts with configured default provider", () => {
    expect(buildFallbackOrder(settings)).toEqual(settings.ocrFallbackOrder)
  })

  it("moves explicitly requested provider to the front without duplicates", () => {
    expect(buildFallbackOrder(settings, "ocr_browser_paddle")).toEqual([
      "ocr_browser_paddle",
      "windows_ocr",
      "tesseract_cli",
      "tesseract_js",
      "ocr_space",
    ])
  })
})

describe("makeResult", () => {
  it("returns success when text is present", () => {
    const result = makeResult("tesseract_js", "frontend", performance.now() - 50, "hello")
    expect(result.status).toBe("success")
    expect(result.text).toBe("hello")
    expect(result.durationMs).toBeGreaterThan(0)
  })

  it("returns empty when text is blank", () => {
    const result = makeResult("windows_ocr", "rust", performance.now() - 5, "   ")
    expect(result.status).toBe("empty")
  })

  it("returns error when error message is provided", () => {
    const result = makeResult(
      "ocr_space",
      "cloud",
      performance.now() - 20,
      "",
      "network failed",
    )
    expect(result.status).toBe("error")
    expect(result.errorMessage).toBe("network failed")
  })
})
