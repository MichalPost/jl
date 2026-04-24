import type {
  AppSettings,
  OcrProviderId,
  OcrProviderInfo,
  OcrResult,
  OcrRuntime,
  StartScreenshotOcrPayload,
  TextSelectedPayload,
} from "@/types"
import { isTauriEnvironment, tauriApi } from "@/lib/tauri"

export interface OcrInput {
  imageDataUrl?: string
  imagePath?: string
  x?: number
  y?: number
}

const OCR_BROWSER_MODELS = {
  detectionPath: "/ocr-models/ch_PP-OCRv4_det_infer.onnx",
  recognitionPath: "/ocr-models/ch_PP-OCRv4_rec_infer.onnx",
  dictionaryPath: "/ocr-models/ppocr_keys_v1.txt",
}

const FRONTEND_PROVIDER_META: Record<
  Extract<OcrProviderId, "tesseract_js" | "ocr_browser_paddle" | "ocr_space">,
  Pick<OcrProviderInfo, "name" | "runtime" | "supportsOffline" | "supportsLanguages" | "priority">
> = {
  tesseract_js: {
    name: "Tesseract.js",
    runtime: "frontend",
    supportsOffline: true,
    supportsLanguages: ["auto", "eng", "chi_sim"],
    priority: 3,
  },
  ocr_browser_paddle: {
    name: "OCR Browser Paddle",
    runtime: "frontend",
    supportsOffline: true,
    supportsLanguages: ["zh-CN", "en"],
    priority: 4,
  },
  ocr_space: {
    name: "OCR.space",
    runtime: "cloud",
    supportsOffline: false,
    supportsLanguages: ["auto", "eng", "chs"],
    priority: 5,
  },
}

let gutenOcrPromise: Promise<
  | {
      detect: (image: string) => Promise<Array<{ text: string }>>
    }
  | undefined
> | null = null

const gutenBrowserModuleUrl = "https://esm.sh/@gutenye/ocr-browser@1.4.8"

function normalizeLanguage(language: string | undefined, providerId: OcrProviderId) {
  const value = language?.trim() || "auto"
  if (providerId === "ocr_space") {
    if (value === "zh-CN" || value === "chi_sim") {
      return "chs"
    }
    if (value === "auto") {
      return "eng"
    }
    return value
  }

  if (value === "zh-CN") {
    return "chi_sim"
  }

  if (value === "auto" && providerId === "ocr_browser_paddle") {
    return "zh-CN"
  }

  return value
}

function getPreferredImageSource(input: OcrInput) {
  return input.imageDataUrl ?? input.imagePath ?? ""
}

export function buildFallbackOrder(
  settings: AppSettings,
  requestedProvider?: OcrProviderId,
) {
  const order: OcrProviderId[] = []
  if (requestedProvider) {
    order.push(requestedProvider)
  } else {
    order.push(settings.ocrProvider)
  }

  for (const providerId of settings.ocrFallbackOrder) {
    if (!order.includes(providerId)) {
      order.push(providerId)
    }
  }

  return order
}

export function makeResult(
  provider: OcrProviderId,
  runtime: OcrRuntime,
  startedAt: number,
  text: string,
  errorMessage?: string,
  fallbackChain: string[] = [],
): OcrResult {
  const normalizedText = text.trim()
  return {
    provider,
    runtime,
    status: errorMessage ? "error" : normalizedText ? "success" : "empty",
    text: normalizedText,
    durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
    errorMessage,
    fallbackChain,
  }
}

async function runTesseractJs(
  input: OcrInput,
  language: string,
): Promise<OcrResult> {
  const startedAt = performance.now()
  const source = getPreferredImageSource(input)
  const { createWorker } = await import("tesseract.js")
  const worker = await createWorker(
    normalizeLanguage(language, "tesseract_js") || "eng",
  )

  try {
    const result = await worker.recognize(source)
    return makeResult(
      "tesseract_js",
      "frontend",
      startedAt,
      result.data.text ?? "",
    )
  } catch (error) {
    return makeResult(
      "tesseract_js",
      "frontend",
      startedAt,
      "",
      error instanceof Error ? error.message : "Tesseract.js 识别失败",
    )
  } finally {
    await worker.terminate()
  }
}

async function getGutenOcr() {
  if (!gutenOcrPromise) {
    gutenOcrPromise = import(
      /* @vite-ignore */ gutenBrowserModuleUrl
    )
      .then(async (module) => {
        const Ocr = module.default as {
          create: (options: {
            models: typeof OCR_BROWSER_MODELS
          }) => Promise<{ detect: (image: string) => Promise<Array<{ text: string }>> }>
        }
        return Ocr.create({ models: OCR_BROWSER_MODELS })
      })
      .catch(() => undefined)
  }

  return gutenOcrPromise
}

async function runBrowserPaddle(
  input: OcrInput,
): Promise<OcrResult> {
  const startedAt = performance.now()
  const source = getPreferredImageSource(input)
  const engine = await getGutenOcr()

  if (!engine) {
    return makeResult(
      "ocr_browser_paddle",
      "frontend",
      startedAt,
      "",
      "OCR Browser Paddle 初始化失败",
    )
  }

  try {
    const lines = await engine.detect(source)
    return makeResult(
      "ocr_browser_paddle",
      "frontend",
      startedAt,
      lines.map((line) => line.text).join("\n"),
    )
  } catch (error) {
    return makeResult(
      "ocr_browser_paddle",
      "frontend",
      startedAt,
      "",
      error instanceof Error ? error.message : "OCR Browser Paddle 识别失败",
    )
  }
}

async function runOcrSpace(
  input: OcrInput,
  settings: AppSettings,
  language: string,
): Promise<OcrResult> {
  const startedAt = performance.now()
  if (!settings.ocrCloudApiKey) {
    return makeResult(
      "ocr_space",
      "cloud",
      startedAt,
      "",
      "未配置 OCR.space API Key",
    )
  }

  try {
    const formData = new FormData()
    formData.append("apikey", settings.ocrCloudApiKey)
    formData.append("language", normalizeLanguage(language, "ocr_space"))
    formData.append("isOverlayRequired", "false")
    formData.append("OCREngine", "2")

    if (input.imageDataUrl) {
      formData.append("base64Image", input.imageDataUrl)
    } else if (input.imagePath) {
      formData.append("url", input.imagePath)
    } else {
      throw new Error("OCR.space 缺少图片输入")
    }

    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: formData,
    })
    const data = (await response.json()) as {
      IsErroredOnProcessing?: boolean
      ErrorMessage?: string[] | string
      ParsedResults?: Array<{ ParsedText?: string }>
    }

    if (!response.ok || data.IsErroredOnProcessing) {
      const message = Array.isArray(data.ErrorMessage)
        ? data.ErrorMessage.join(", ")
        : data.ErrorMessage || "OCR.space 识别失败"
      return makeResult("ocr_space", "cloud", startedAt, "", message)
    }

    return makeResult(
      "ocr_space",
      "cloud",
      startedAt,
      data.ParsedResults?.map((item) => item.ParsedText ?? "").join("\n") ?? "",
    )
  } catch (error) {
    return makeResult(
      "ocr_space",
      "cloud",
      startedAt,
      "",
      error instanceof Error ? error.message : "OCR.space 识别失败",
    )
  }
}

export async function listUnifiedOcrProviders(
  settings: AppSettings,
): Promise<OcrProviderInfo[]> {
  const backendProviders = await tauriApi.listOcrProviders().catch(() => [])

  return backendProviders.map((provider) => {
    if (provider.id === "tesseract_js" || provider.id === "ocr_browser_paddle") {
      return {
        ...provider,
        available: settings.ocrEnableFrontendProviders && provider.available,
      }
    }

    if (provider.id === "ocr_space") {
      return {
        ...provider,
        available: Boolean(settings.ocrCloudApiKey) && provider.available,
      }
    }

    return provider
  })
}

export async function executeOcrWithFallback(
  input: OcrInput,
  settings: AppSettings,
  options: {
    providerId?: OcrProviderId
    disableFallback?: boolean
    emitSelection?: boolean
  } = {},
): Promise<OcrResult> {
  const providers = await listUnifiedOcrProviders(settings)
  const requestedOrder = buildFallbackOrder(settings, options.providerId)
  const order = options.disableFallback
    ? requestedOrder.slice(0, 1)
    : requestedOrder
  const fallbackChain: string[] = []

  for (const providerId of order) {
    const provider = providers.find((item) => item.id === providerId)
    if (!provider || !provider.available) {
      fallbackChain.push(providerId)
      continue
    }

    let result: OcrResult

    if (provider.runtime === "rust") {
      result = await tauriApi.startScreenshotOcr({
        providerId,
        language: settings.ocrLanguage,
        disableFallback: true,
        emitSelection: options.emitSelection,
        imageDataUrl: input.imageDataUrl,
        imagePath: input.imagePath,
        x: input.x,
        y: input.y,
      })
    } else if (providerId === "tesseract_js") {
      result = await runTesseractJs(input, settings.ocrLanguage)
    } else if (providerId === "ocr_browser_paddle") {
      result = await runBrowserPaddle(input)
    } else {
      result = await runOcrSpace(input, settings, settings.ocrLanguage)
    }

    result.fallbackChain = [...fallbackChain]

    if (result.status === "success") {
      return result
    }

    fallbackChain.push(providerId)
  }

  return {
    provider: options.providerId ?? settings.ocrProvider,
    runtime: "frontend",
    status: "error",
    text: "",
    durationMs: 0,
    errorMessage: "所有 OCR Provider 均不可用或识别失败",
    fallbackChain,
  }
}

export function buildOcrSelectionPayload(
  result: OcrResult,
  input: OcrInput,
): TextSelectedPayload {
  return {
    text: result.text,
    x: input.x ?? Math.max(window.innerWidth * 0.4, 220),
    y: input.y ?? Math.max(window.innerHeight * 0.25, 140),
    source: {
      type: "unknown",
      title: `OCR: ${result.provider}`,
    },
    context: {
      before: "",
      after: "",
    },
    ocr: {
      provider: result.provider,
      runtime: result.runtime,
      status: result.status,
      durationMs: result.durationMs,
    },
  }
}

export async function emitSelectionFromFrontendOcr(
  result: OcrResult,
  input: OcrInput,
) {
  const payload = buildOcrSelectionPayload(result, input)
  if (isTauriEnvironment()) {
    await tauriApi.rememberSelection(payload)
  }
  window.dispatchEvent(
    new CustomEvent("textclip:frontend-ocr-selection", {
      detail: payload,
    }),
  )
}

export function createOcrDemoImage(text: string) {
  const canvas = document.createElement("canvas")
  canvas.width = 960
  canvas.height = 360
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("无法创建 OCR 测试画布")
  }

  context.fillStyle = "#f8fafc"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = "#0f172a"
  context.font = "36px 'Microsoft YaHei', sans-serif"
  context.fillText("TextClip OCR Demo", 48, 96)
  context.font = "30px 'Microsoft YaHei', sans-serif"
  context.fillText(text, 48, 168)
  context.fillText("Switch providers and compare results.", 48, 230)
  context.strokeStyle = "#cbd5e1"
  context.lineWidth = 4
  context.strokeRect(24, 24, canvas.width - 48, canvas.height - 48)

  return canvas.toDataURL("image/png")
}

export function getFrontendProviderMeta(providerId: OcrProviderId) {
  return FRONTEND_PROVIDER_META[
    providerId as keyof typeof FRONTEND_PROVIDER_META
  ]
}
