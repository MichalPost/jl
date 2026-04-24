import { useEffect, useMemo, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckCircle2,
  Cpu,
  FolderOpenDot,
  Globe,
  LoaderCircle,
  RefreshCcw,
  Save,
  ScanSearch,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"
import { createOcrDemoImage, emitSelectionFromFrontendOcr, executeOcrWithFallback, listUnifiedOcrProviders } from "@/lib/ocr"
import { settingsSchema } from "@/lib/schema"
import { tauriApi } from "@/lib/tauri"
import { applyTheme, isReadableColor, normalizeHexColor } from "@/lib/theme/apply-theme"
import { THEME_LABELS, THEME_OPTIONS } from "@/lib/theme/theme-options"
import type { AppSettings, OcrProviderId } from "@/types"
import { cn } from "@/utils/cn"

const OCR_PROVIDER_LABELS: Record<OcrProviderId, string> = {
  windows_ocr: "Windows OCR",
  tesseract_cli: "Tesseract CLI",
  tesseract_js: "Tesseract.js",
  ocr_browser_paddle: "OCR Browser Paddle",
  ocr_space: "OCR.space",
}

const fallbackProviderSchema = z.enum([
  "windows_ocr",
  "tesseract_cli",
  "tesseract_js",
  "ocr_browser_paddle",
  "ocr_space",
])

const settingsFormSchema = settingsSchema.extend({
  aiApiEndpoint: z.string().trim().url("请输入合法的 API Endpoint"),
  aiModel: z.string().trim().min(1, "请输入模型名称"),
  screenshotHotkey: z.string().trim().min(1, "请输入截图快捷键"),
  spotlightHotkey: z.string().trim().min(1, "请输入 Spotlight 快捷键"),
  quickSaveHotkey: z.string().trim().min(1, "请输入快捷保存快捷键"),
  pluginDir: z.string().trim().min(1, "请输入插件目录"),
  customPrimaryColor: z
    .string()
    .optional()
    .transform((value) => normalizeHexColor(value))
    .refine((value) => !value || /^#[0-9a-f]{6}$/i.test(value), "请输入合法的 6 位 Hex 颜色")
    .refine((value) => !value || isReadableColor(value), "该颜色过浅或过暗，可读性不足"),
  ocrFallbackOrder: z
    .array(fallbackProviderSchema)
    .min(1, "至少保留一个 OCR 回退引擎"),
})

type SettingsFormInput = z.input<typeof settingsFormSchema>
type SettingsFormValues = z.output<typeof settingsFormSchema>

const DEFAULT_FALLBACK_ORDER: OcrProviderId[] = [
  "windows_ocr",
  "tesseract_cli",
  "tesseract_js",
  "ocr_browser_paddle",
  "ocr_space",
]

function normalizeSettingsToForm(settings: AppSettings): SettingsFormValues {
  return {
    ...settings,
    aiApiKey: settings.aiApiKey ?? "",
    customPrimaryColor: normalizeHexColor(settings.customPrimaryColor),
    ocrTesseractPath: settings.ocrTesseractPath ?? "",
    ocrCloudProvider: settings.ocrCloudProvider ?? "ocr_space",
    ocrCloudApiKey: settings.ocrCloudApiKey ?? "",
    ocrPreferredOfflineProvider: settings.ocrPreferredOfflineProvider,
    ocrFallbackOrder:
      settings.ocrFallbackOrder?.length ? settings.ocrFallbackOrder : DEFAULT_FALLBACK_ORDER,
  }
}

function toSavePayload(values: SettingsFormValues): Partial<AppSettings> {
  const customPrimaryColor = normalizeHexColor(values.customPrimaryColor)

  return {
    ...values,
    aiApiKey: values.aiApiKey?.trim() || undefined,
    aiApiEndpoint: values.aiApiEndpoint.trim(),
    aiModel: values.aiModel.trim(),
    screenshotHotkey: values.screenshotHotkey.trim(),
    spotlightHotkey: values.spotlightHotkey.trim(),
    quickSaveHotkey: values.quickSaveHotkey.trim(),
    pluginDir: values.pluginDir.trim(),
    customPrimaryColor:
      values.theme === "custom" ? customPrimaryColor : undefined,
    ocrTesseractPath: values.ocrTesseractPath?.trim() || undefined,
    ocrCloudProvider: values.ocrCloudApiKey?.trim() ? "ocr_space" : undefined,
    ocrCloudApiKey: values.ocrCloudApiKey?.trim() || undefined,
    ocrPreferredOfflineProvider:
      values.ocrPreferredOfflineProvider || undefined,
  }
}

async function saveSettingsAndRefresh(
  queryClient: QueryClient,
  payload: Partial<AppSettings>,
) {
  await tauriApi.saveSettings(payload)
  const nextSettings = await tauriApi.getSettings()
  applyTheme(nextSettings)
  queryClient.setQueryData(["settings"], nextSettings)
  await queryClient.invalidateQueries({ queryKey: ["ocr-providers"] })
  return nextSettings
}

function CheckboxField({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  title: string
  description: string
}) {
  return (
    <label className="border-border/70 bg-surface/74 flex cursor-pointer items-start justify-between gap-3 rounded-[22px] border px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-muted mt-1 text-sm leading-6">{description}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 shrink-0 accent-[--app-primary-fallback,#2563eb]"
      />
    </label>
  )
}

function TextField({
  label,
  error,
  helper,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
  helper?: string
}) {
  return (
    <label className="grid gap-2">
      <span className="text-muted text-xs tracking-[0.2em] uppercase">{label}</span>
      <input
        {...props}
        className={cn(
          "border-border/70 bg-bg/92 rounded-[18px] border px-4 py-3 text-sm outline-none transition",
          error && "border-rose-400/70 focus:border-rose-500",
          props.className,
        )}
      />
      {error ? <span className="text-sm text-rose-600">{error}</span> : null}
      {!error && helper ? <span className="text-muted text-xs">{helper}</span> : null}
    </label>
  )
}

function SelectField({
  label,
  error,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className="grid gap-2">
      <span className="text-muted text-xs tracking-[0.2em] uppercase">{label}</span>
      <select
        {...props}
        className={cn(
          "border-border/70 bg-bg/92 rounded-[18px] border px-4 py-3 text-sm outline-none transition",
          error && "border-rose-400/70 focus:border-rose-500",
          props.className,
        )}
      >
        {children}
      </select>
      {error ? <span className="text-sm text-rose-600">{error}</span> : null}
    </label>
  )
}

function reorderFallback(
  order: OcrProviderId[],
  provider: OcrProviderId,
  direction: "up" | "down",
) {
  const currentIndex = order.indexOf(provider)
  if (currentIndex === -1) {
    return order
  }

  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1
  if (nextIndex < 0 || nextIndex >= order.length) {
    return order
  }

  const next = [...order]
  const [item] = next.splice(currentIndex, 1)
  next.splice(nextIndex, 0, item)
  return next
}

function getParsedFormValues(
  values: SettingsFormInput,
): SettingsFormValues {
  return settingsFormSchema.parse(values)
}

export function SettingsForm() {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: tauriApi.getSettings,
  })
  const form = useForm<SettingsFormInput, unknown, SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    mode: "onBlur",
    defaultValues: normalizeSettingsToForm({
      aiApiEndpoint: "",
      aiModel: "",
      screenshotHotkey: "",
      spotlightHotkey: "",
      quickSaveHotkey: "",
      pluginDir: "plugins",
      theme: "snow",
      followSystemTheme: false,
      ocrProvider: "windows_ocr",
      ocrFallbackOrder: DEFAULT_FALLBACK_ORDER,
      ocrLanguage: "auto",
      ocrEnableFrontendProviders: true,
      ocrCloudProvider: "ocr_space",
    } as AppSettings),
  })

  const values = form.watch()

  useEffect(() => {
    if (!settingsQuery.data) {
      return
    }

    form.reset(normalizeSettingsToForm(settingsQuery.data))
  }, [form, settingsQuery.data])

  useEffect(() => {
    if (!settingsQuery.data) {
      return
    }

    applyTheme({
      ...settingsQuery.data,
      ...toSavePayload(getParsedFormValues(form.getValues())),
    } as AppSettings)
  }, [
    form,
    settingsQuery.data,
    values.customPrimaryColor,
    values.followSystemTheme,
    values.theme,
  ])

  const ocrProvidersQuery = useQuery({
    queryKey: [
      "ocr-providers",
      values.ocrEnableFrontendProviders,
      values.ocrCloudApiKey,
      values.ocrTesseractPath,
    ],
    queryFn: async () =>
      listUnifiedOcrProviders(
        toSavePayload(getParsedFormValues(form.getValues())) as AppSettings,
      ),
  })

  const saveMutation = useMutation({
    mutationFn: async (payload: SettingsFormValues) =>
      saveSettingsAndRefresh(queryClient, toSavePayload(payload)),
    onSuccess: (nextSettings) => {
      form.reset(normalizeSettingsToForm(nextSettings))
      toast.success("设置已保存", {
        description: "主题、OCR 和快捷键配置已同步更新。",
      })
    },
    onError: (error) => {
      toast.error("设置保存失败", {
        description: error instanceof Error ? error.message : "请稍后再试。",
      })
    },
  })

  const resetMutation = useMutation({
    mutationFn: async () =>
      saveSettingsAndRefresh(queryClient, {
        ...(settingsQuery.data ?? {}),
        ...({
          aiApiKey: undefined,
          aiApiEndpoint: "https://api.openai.com/v1/chat/completions",
          aiModel: "gpt-4.1-mini",
          screenshotHotkey: "Ctrl+Shift+S",
          spotlightHotkey: "Alt+Space",
          quickSaveHotkey: "Ctrl+D",
          pluginDir: "plugins",
          theme: "snow",
          customPrimaryColor: undefined,
          followSystemTheme: false,
          ocrProvider: "windows_ocr",
          ocrFallbackOrder: DEFAULT_FALLBACK_ORDER,
          ocrLanguage: "auto",
          ocrTesseractPath: undefined,
          ocrCloudProvider: undefined,
          ocrCloudApiKey: undefined,
          ocrEnableFrontendProviders: true,
          ocrPreferredOfflineProvider: "windows_ocr",
        } satisfies Partial<AppSettings>),
      }),
    onSuccess: (nextSettings) => {
      form.reset(normalizeSettingsToForm(nextSettings))
      toast.success("已恢复默认设置")
    },
    onError: (error) => {
      toast.error("恢复默认设置失败", {
        description: error instanceof Error ? error.message : "请稍后再试。",
      })
    },
  })

  const ocrTestMutation = useMutation({
    mutationFn: async (settings: AppSettings) => {
      const imageDataUrl = createOcrDemoImage("多 OCR 切换测试 / OCR provider switch test")
      const result = await executeOcrWithFallback(
        { imageDataUrl, x: 260, y: 140 },
        settings,
        { emitSelection: false },
      )

      if (result.status === "success" && result.runtime !== "rust") {
        await emitSelectionFromFrontendOcr(result, {
          imageDataUrl,
          x: 260,
          y: 140,
        })
      }

      return result
    },
    onSuccess: (result) => {
      if (result.status === "success") {
        toast.success(
          `OCR 测试成功：${OCR_PROVIDER_LABELS[result.provider as OcrProviderId] ?? result.provider}`,
          {
            description: result.text.slice(0, 72) || "识别已完成。",
            duration: 2600,
          },
        )
      } else {
        toast.error("OCR 测试失败", {
          description: result.errorMessage ?? "没有可用的 OCR Provider。",
          duration: 2800,
        })
      }
    },
  })

  const customColorPreview = useMemo(
    () => normalizeHexColor(values.customPrimaryColor) ?? "#2563eb",
    [values.customPrimaryColor],
  )

  const lastOcrResult = ocrTestMutation.data
  const errors = form.formState.errors

  return (
    <form
      className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]"
      onSubmit={form.handleSubmit((payload: SettingsFormValues) => saveMutation.mutate(payload))}
    >
      <div className="grid gap-6">
        <div className="border-border/70 bg-surface/76 rounded-[28px] border p-5 shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur-[--blur-glass]">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-muted text-xs tracking-[0.28em] uppercase">Settings</p>
              <h2 className="mt-2 font-serif text-3xl font-semibold">全局设置表单</h2>
              <p className="text-muted mt-2 text-sm leading-6">
                把 AI、快捷键、插件目录、主题和 OCR 统一放进一个可校验、可保存、可重置的设置面板。
              </p>
            </div>
            <div className="bg-primary/10 text-primary rounded-2xl p-3">
              <Sparkles className="size-5" />
            </div>
          </div>

          <div className="grid gap-6">
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="AI Endpoint"
                error={errors.aiApiEndpoint?.message}
                placeholder="https://api.openai.com/v1/chat/completions"
                {...form.register("aiApiEndpoint")}
              />
              <TextField
                label="AI Model"
                error={errors.aiModel?.message}
                placeholder="gpt-4.1-mini"
                {...form.register("aiModel")}
              />
              <TextField
                label="AI Key"
                type="password"
                helper="留空则沿用本地已有配置。"
                error={errors.aiApiKey?.message}
                placeholder="sk-..."
                {...form.register("aiApiKey")}
              />
              <TextField
                label="插件目录"
                error={errors.pluginDir?.message}
                placeholder="plugins"
                {...form.register("pluginDir")}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <TextField
                label="截图快捷键"
                error={errors.screenshotHotkey?.message}
                {...form.register("screenshotHotkey")}
              />
              <TextField
                label="Spotlight 快捷键"
                error={errors.spotlightHotkey?.message}
                {...form.register("spotlightHotkey")}
              />
              <TextField
                label="快捷保存"
                error={errors.quickSaveHotkey?.message}
                {...form.register("quickSaveHotkey")}
              />
            </div>

            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-[1fr_0.8fr]">
                <SelectField
                  label="主题"
                  error={errors.theme?.message}
                  {...form.register("theme")}
                >
                  {THEME_OPTIONS.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.label}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label="自定义主色"
                  error={errors.customPrimaryColor?.message}
                  placeholder="#2563eb"
                  disabled={values.theme !== "custom"}
                  {...form.register("customPrimaryColor")}
                />
              </div>

              <div className="border-border/70 bg-bg/82 rounded-[22px] border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      当前主题：{THEME_LABELS[values.theme] ?? "未知主题"}
                    </p>
                    <p className="text-muted mt-1 text-sm">
                      {values.followSystemTheme
                        ? "已开启跟随系统亮暗模式。"
                        : values.theme === "custom"
                          ? `使用自定义主色 ${customColorPreview}。`
                          : "使用预设主题。"}
                    </p>
                  </div>
                  <div
                    className="size-11 rounded-2xl border border-white/40 shadow-inner"
                    style={{ backgroundColor: customColorPreview }}
                  />
                </div>
              </div>

              <CheckboxField
                checked={values.followSystemTheme}
                onChange={(checked) => form.setValue("followSystemTheme", checked, { shouldDirty: true })}
                title="跟随系统亮暗模式"
                description="开启后，运行时会跟随系统明暗切换，同时保留你选择的主题。"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="bg-primary hover:bg-primary/90 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white transition disabled:cursor-wait disabled:opacity-70"
              >
                {saveMutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                保存设置
              </button>
              <button
                type="button"
                disabled={resetMutation.isPending}
                onClick={() => resetMutation.mutate()}
                className="border-border/70 hover:border-primary/50 bg-bg/90 inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition disabled:cursor-wait disabled:opacity-70"
              >
                {resetMutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <RefreshCcw className="size-4" />
                )}
                恢复默认值
              </button>
              {form.formState.isSubmitSuccessful && !saveMutation.isPending ? (
                <span className="text-emerald-700 inline-flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4" />
                  已同步到 `settings.json`
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <div className="border-border/70 bg-surface/76 rounded-[28px] border p-5 shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur-[--blur-glass]">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-muted text-xs tracking-[0.28em] uppercase">OCR</p>
              <h2 className="mt-2 font-serif text-3xl font-semibold">多引擎识别设置</h2>
              <p className="text-muted mt-2 text-sm leading-6">
                支持默认引擎、回退顺序、前端 OCR 开关、Tesseract 路径和云端兜底配置。
              </p>
            </div>
            <div className="bg-primary/10 text-primary rounded-2xl p-3">
              <ScanSearch className="size-5" />
            </div>
          </div>

          <div className="grid gap-4">
            <SelectField
              label="默认 OCR"
              error={errors.ocrProvider?.message}
              {...form.register("ocrProvider")}
            >
              {Object.entries(OCR_PROVIDER_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </SelectField>

            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="OCR 语言"
                error={errors.ocrLanguage?.message}
                {...form.register("ocrLanguage")}
              >
                <option value="auto">自动</option>
                <option value="zh-CN">中文</option>
                <option value="en">English</option>
                <option value="chi_sim">chi_sim</option>
                <option value="eng">eng</option>
              </SelectField>
              <SelectField
                label="离线优先"
                error={errors.ocrPreferredOfflineProvider?.message}
                value={values.ocrPreferredOfflineProvider ?? ""}
                onChange={(event) =>
                  form.setValue(
                    "ocrPreferredOfflineProvider",
                    (event.target.value || undefined) as SettingsFormValues["ocrPreferredOfflineProvider"],
                    { shouldDirty: true },
                  )
                }
              >
                <option value="">不指定</option>
                {Object.entries(OCR_PROVIDER_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </SelectField>
            </div>

            <CheckboxField
              checked={values.ocrEnableFrontendProviders}
              onChange={(checked) =>
                form.setValue("ocrEnableFrontendProviders", checked, { shouldDirty: true })
              }
              title="启用前端 OCR Provider"
              description="允许 `tesseract.js` 与 `@gutenye/ocr-browser` 作为懒加载离线备用。"
            />

            <TextField
              label="Tesseract 可执行路径"
              error={errors.ocrTesseractPath?.message}
              placeholder="C:\\Program Files\\Tesseract-OCR\\tesseract.exe"
              {...form.register("ocrTesseractPath")}
            />

            <TextField
              label="OCR.space API Key"
              error={errors.ocrCloudApiKey?.message}
              placeholder="可选：云端兜底"
              {...form.register("ocrCloudApiKey")}
            />

            <div className="border-border/60 bg-bg/82 rounded-[22px] border p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-muted text-xs tracking-[0.22em] uppercase">Fallback Order</p>
                  <p className="mt-2 text-sm font-medium">
                    {values.ocrFallbackOrder
                      .map((id) => OCR_PROVIDER_LABELS[id])
                      .join(" → ")}
                  </p>
                </div>
                <Cpu className="text-primary size-4" />
              </div>

              <div className="grid gap-3">
                {values.ocrFallbackOrder.map((provider, index) => {
                  const providerInfo = ocrProvidersQuery.data?.find((item) => item.id === provider)

                  return (
                    <div
                      key={provider}
                      className="border-border/60 bg-surface/80 rounded-[20px] border px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{OCR_PROVIDER_LABELS[provider]}</p>
                          <p className="text-muted mt-1 text-xs">
                            {providerInfo?.runtime ?? "unknown"} ·{" "}
                            {providerInfo?.supportsOffline ? "离线可用" : "需要网络"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-medium",
                              providerInfo?.available
                                ? "bg-emerald-500/10 text-emerald-700"
                                : "bg-amber-500/10 text-amber-700",
                            )}
                          >
                            {providerInfo?.available ? "可用" : "待配置"}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              form.setValue(
                                "ocrFallbackOrder",
                                reorderFallback(values.ocrFallbackOrder, provider, "up"),
                                { shouldDirty: true },
                              )
                            }
                            disabled={index === 0}
                            className="border-border/60 rounded-full border px-2 py-1 text-xs disabled:opacity-40"
                          >
                            上移
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              form.setValue(
                                "ocrFallbackOrder",
                                reorderFallback(values.ocrFallbackOrder, provider, "down"),
                                { shouldDirty: true },
                              )
                            }
                            disabled={index === values.ocrFallbackOrder.length - 1}
                            className="border-border/60 rounded-full border px-2 py-1 text-xs disabled:opacity-40"
                          >
                            下移
                          </button>
                        </div>
                      </div>
                      {providerInfo?.reason ? (
                        <p className="text-muted mt-2 text-xs leading-6">{providerInfo.reason}</p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={ocrTestMutation.isPending}
                onClick={() =>
                  ocrTestMutation.mutate(
                    toSavePayload(getParsedFormValues(form.getValues())) as AppSettings,
                  )
                }
                className="bg-primary hover:bg-primary/90 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white transition disabled:cursor-wait disabled:opacity-70"
              >
                {ocrTestMutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Globe className="size-4" />
                )}
                {ocrTestMutation.isPending ? "正在初始化识别引擎" : "测试当前引擎"}
              </button>
              <button
                type="button"
                onClick={() => void tauriApi.startScreenshotSelection()}
                className="border-border/70 hover:border-primary/50 bg-bg/90 inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition"
              >
                <ScanSearch className="text-primary size-4" />
                进入截图选区
              </button>
              <div className="text-muted inline-flex items-center gap-2 text-sm">
                <FolderOpenDot className="size-4" />
                插件目录：{values.pluginDir}
              </div>
            </div>

            {lastOcrResult ? (
              <div className="border-border/60 bg-bg/82 rounded-[22px] border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-muted text-xs tracking-[0.22em] uppercase">Last OCR Result</p>
                    <p className="mt-2 text-sm font-medium">
                      {OCR_PROVIDER_LABELS[lastOcrResult.provider as OcrProviderId] ??
                        lastOcrResult.provider}
                    </p>
                  </div>
                  <span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-medium">
                    {lastOcrResult.durationMs}ms
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7">
                  {lastOcrResult.text || lastOcrResult.errorMessage}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </form>
  )
}
