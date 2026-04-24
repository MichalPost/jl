import { useEffect, useMemo, useState } from "react"
import {
  BookMarked,
  Highlighter,
  NotebookPen,
  Pin,
  Sparkles,
  SquareCheckBig,
} from "lucide-react"
import { isTauriEnvironment, listen, tauriApi } from "@/lib/tauri"
import { getPopupPluginActions, type PluginPopupAction } from "@/lib/plugins"
import { usePopupStore } from "@/stores/popup-store"
import type { ItemType, SaveItemPayload, TextSelectedPayload } from "@/types"
import { cn } from "@/utils/cn"
import { toErrorMessage } from "@/utils/error"
import { calculatePopupPosition } from "@/utils/popup-position"
import { toast } from "sonner"

const actions = [
  { label: "加入 TODO", icon: SquareCheckBig, kind: "save", itemType: "todo" },
  { label: "存为便签", icon: NotebookPen, kind: "save", itemType: "note" },
  { label: "高亮保存", icon: Highlighter, kind: "save", itemType: "highlight" },
  {
    label: "稍后阅读",
    icon: BookMarked,
    kind: "save",
    itemType: "read_later",
  },
  { label: "钉在桌面", icon: Pin, kind: "sticky" },
] as const

function buildSavePayload(
  selection: TextSelectedPayload,
  itemType: ItemType,
): SaveItemPayload {
  return {
    type: itemType,
    text: selection.text,
    source: selection.source,
    context: selection.context,
  }
}

export default function OverlayWindow() {
  const {
    isVisible,
    selection,
    lastSelection,
    selectionCapturedAt,
    errorMessage,
    setSelection,
    hide,
    setError,
  } = usePopupStore()
  const [pendingLabel, setPendingLabel] = useState<string>()
  const [pluginActions, setPluginActions] = useState<PluginPopupAction[]>([])

  const selectionPreview = useMemo(() => {
    if (!selection) {
      return ""
    }

    return selection.text.length > 160
      ? `${selection.text.slice(0, 160)}...`
      : selection.text
  }, [selection])

  useEffect(() => {
    let active = true

    if (!selection) {
      setPluginActions([])
      return
    }

    void getPopupPluginActions(selection).then((actions) => {
      if (active) {
        setPluginActions(actions)
      }
    })

    return () => {
      active = false
    }
  }, [selection])

  const popupPosition = useMemo(() => {
    if (!selection || typeof window === "undefined") {
      return { x: 0, y: 0 }
    }

    const popupWidth = Math.min(576, Math.max(320, window.innerWidth - 32))
    const popupHeight = window.innerWidth < 640 ? 540 : 460

    return calculatePopupPosition({
      mouseX: selection.x,
      mouseY: selection.y,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      popupWidth,
      popupHeight,
    })
  }, [selection])

  useEffect(() => {
    let cleanup = () => {}

    void listen<TextSelectedPayload>("text-selected", (payload) => {
      setSelection(payload)
      if (isTauriEnvironment()) {
        void tauriApi.rememberSelection(payload)
      }
    }).then((unlisten) => {
      cleanup = unlisten
    })

    return () => cleanup()
  }, [setSelection])

  useEffect(() => {
    const handleFrontendOcrSelection = (event: Event) => {
      const customEvent = event as CustomEvent<TextSelectedPayload>
      setSelection(customEvent.detail)
      if (isTauriEnvironment()) {
        void tauriApi.rememberSelection(customEvent.detail)
      }
    }

    window.addEventListener(
      "textclip:frontend-ocr-selection",
      handleFrontendOcrSelection as EventListener,
    )
    return () =>
      window.removeEventListener(
        "textclip:frontend-ocr-selection",
        handleFrontendOcrSelection as EventListener,
      )
  }, [setSelection])

  useEffect(() => {
    let cleanup = () => {}

    void listen("overlay-dismissed", () => {
      hide()
    }).then((unlisten) => {
      cleanup = unlisten
    })

    return () => cleanup()
  }, [hide])

  useEffect(() => {
    if (!isTauriEnvironment()) {
      return
    }

    if (isVisible) {
      void tauriApi.showOverlayWindow()
      return
    }

    void tauriApi.hideOverlayWindow()
  }, [isVisible])

  useEffect(() => {
    if (!isVisible && !lastSelection) {
      return undefined
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hide()
        return
      }

      if (
        !isTauriEnvironment() &&
        event.ctrlKey &&
        event.key.toLowerCase() === "d"
      ) {
        event.preventDefault()
        void handleQuickSave()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [hide, isVisible, lastSelection, selectionCapturedAt])

  async function saveAsTodo(selectionPayload: TextSelectedPayload) {
    setPendingLabel("快捷保存")
    setError(undefined)

    try {
      await tauriApi.saveItem(buildSavePayload(selectionPayload, "todo"))
      toast.success("已快捷保存到 Inbox", {
        description: "当前划词已直接保存为 TODO。",
        duration: 2000,
      })
      hide()
    } catch (error) {
      const message = toErrorMessage(error)
      setError(message)
      toast.error("快捷保存失败", {
        description: message,
        duration: 2400,
      })
    } finally {
      setPendingLabel(undefined)
    }
  }

  async function handleQuickSave() {
    const hasFreshSelection =
      Boolean(selection) ||
      (Boolean(lastSelection) &&
        Boolean(selectionCapturedAt) &&
        Date.now() - Number(selectionCapturedAt) <= 3000)
    const selectionPayload = selection ?? lastSelection
    if (!selectionPayload || pendingLabel || !hasFreshSelection) {
      return
    }

    await saveAsTodo(selectionPayload)
  }

  async function handleAction(action: (typeof actions)[number]) {
    if (!selection) {
      return
    }

    try {
      if (action.kind === "sticky") {
        setPendingLabel(action.label)
        setError(undefined)
        await tauriApi.createSticky(selection.text)
        toast.success("已创建桌面便利贴", {
          description: "可以继续移动或关闭它。",
          duration: 2000,
        })
        hide()
      } else {
        setPendingLabel(action.label)
        setError(undefined)
        if (action.itemType === "todo") {
          await saveAsTodo(selection)
          return
        }

        await tauriApi.saveItem(buildSavePayload(selection, action.itemType))
        toast.success(action.label, {
          description: "内容已进入 Inbox，主窗口会同步刷新。",
          duration: 2000,
        })
        hide()
      }
    } catch (error) {
      const message = toErrorMessage(error)
      setError(message)
      toast.error("保存失败", {
        description: message,
        duration: 2400,
      })
    } finally {
      setPendingLabel(undefined)
    }
  }

  async function handlePluginAction(action: PluginPopupAction) {
    if (!selection || pendingLabel) {
      return
    }

    setPendingLabel(action.label)
    setError(undefined)

    try {
      if (action.kind === "save") {
        await tauriApi.saveItem(buildSavePayload(selection, action.itemType))
        toast.success(action.label, {
          description: "插件动作已完成保存。",
          duration: 2000,
        })
        hide()
        return
      }

      if (action.kind === "sticky") {
        await tauriApi.createSticky(selection.text)
        toast.success(action.label, {
          description: "已创建桌面便利贴。",
          duration: 2000,
        })
        hide()
        return
      }

      if (action.kind === "copy-text") {
        await navigator.clipboard.writeText(selection.text)
        toast.success("已复制当前文本", { duration: 1800 })
        return
      }

      if (action.kind === "show-task-manager") {
        await tauriApi.showTaskManagerWindow()
        hide()
      }
    } catch (error) {
      const message = toErrorMessage(error)
      setError(message)
      toast.error("插件动作失败", {
        description: message,
        duration: 2400,
      })
    } finally {
      setPendingLabel(undefined)
    }
  }

  return (
    <div
      className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_right,_rgba(99,102,241,0.2),_transparent_20%),radial-gradient(circle_at_bottom_left,_rgba(236,72,153,0.18),_transparent_22%)] p-4 sm:p-8"
      onClick={() => {
        if (isVisible) {
          hide()
        }
      }}
    >
      <div className="text-muted rounded-full bg-white/65 px-4 py-2 text-sm shadow-lg backdrop-blur-md">
        浏览器调试模式：按 <span className="font-medium">Ctrl + Shift + T</span>{" "}
        触发模拟划词，按 <span className="font-medium">Ctrl + D</span> 快捷直存
      </div>
      {isVisible && selection ? (
        <div
          className="border-border/70 bg-bg/78 text-text fixed z-10 w-[min(36rem,calc(100vw-2rem))] rounded-[28px] border p-4 shadow-[0_30px_80px_rgba(15,23,42,0.18)] backdrop-blur-[--blur-glass] sm:rounded-[32px] sm:p-6"
          onClick={(event) => event.stopPropagation()}
          style={{
            left: popupPosition.x,
            top: popupPosition.y,
          }}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-muted text-xs tracking-[0.28em] uppercase">
                Overlay Popup
              </p>
              <h2 className="mt-2 font-serif text-3xl font-semibold">
                一键把灵感收束
              </h2>
            </div>
            <button
              className="border-border/70 hover:border-primary/50 rounded-full border px-3 py-1 text-sm transition"
              onClick={hide}
            >
              关闭
            </button>
          </div>
          <div className="bg-surface/75 rounded-[26px] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted text-xs uppercase">Selected Text</p>
              {selection.ocr ? (
                <span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-[11px] font-medium">
                  OCR · {selection.ocr.provider}
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-sm leading-7 sm:text-base">
              {selectionPreview}
            </p>
          </div>
          {errorMessage ? (
            <div className="mt-4 rounded-[22px] border border-rose-300/60 bg-rose-50/85 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {actions.map((action) => {
              const Icon = action.icon
              const isPending = pendingLabel === action.label

              return (
                <button
                  key={action.label}
                  type="button"
                  disabled={Boolean(pendingLabel)}
                  onClick={() => void handleAction(action)}
                  className={cn(
                    "border-border/70 hover:border-primary/50 hover:bg-primary/8 flex min-w-0 items-center gap-3 rounded-[22px] border bg-white/72 px-4 py-3 text-left transition disabled:cursor-wait disabled:opacity-65",
                    isPending && "border-primary bg-primary/10",
                  )}
                >
                  <span
                    className={cn(
                      "bg-primary/10 text-primary rounded-2xl p-2",
                      isPending && "bg-primary text-white",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="truncate font-medium">
                    {isPending ? "处理中..." : action.label}
                  </span>
                </button>
              )
            })}
            {pluginActions.map((action) => {
              const isPending = pendingLabel === action.label
              return (
                <button
                  key={action.id}
                  type="button"
                  disabled={Boolean(pendingLabel)}
                  onClick={() => void handlePluginAction(action)}
                  className={cn(
                    "border-border/70 hover:border-primary/50 hover:bg-primary/8 flex min-w-0 items-center gap-3 rounded-[22px] border bg-surface/72 px-4 py-3 text-left transition disabled:cursor-wait disabled:opacity-65",
                    isPending && "border-primary bg-primary/10",
                  )}
                >
                  <span
                    className={cn(
                      "bg-primary/10 text-primary rounded-2xl p-2",
                      isPending && "bg-primary text-white",
                    )}
                  >
                    <Sparkles className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {isPending ? "处理中..." : action.label}
                    </span>
                    {action.description ? (
                      <span className="text-muted block truncate text-xs">
                        {action.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="from-primary/12 via-primary/7 mt-5 rounded-[26px] bg-gradient-to-br to-transparent p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="text-primary size-4" />
              <p className="text-sm font-medium">AI 建议区域预览</p>
            </div>
            <p className="text-muted mt-2 text-sm leading-7">
              {pendingLabel
                ? `${pendingLabel} 正在进行中，完成后会自动关闭当前 Popup。`
                : "这段内容看起来像一条需要后续执行的事项，建议先加入 Inbox，再决定是否挂提醒或拖进项目夹。"}
            </p>
            <p className="text-muted mt-4 text-xs">
              来源：
              {selection.source.title ?? selection.source.appName ?? "来源未知"}
            </p>
            {selection.ocr ? (
              <p className="text-muted mt-1 text-xs">
                识别来源：{selection.ocr.provider} · {selection.ocr.durationMs}ms
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="border-border/60 bg-bg/65 text-text mt-8 max-w-lg rounded-[32px] border p-6 shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur-[--blur-glass]">
          <p className="text-muted text-xs tracking-[0.28em] uppercase">
            Idle State
          </p>
          <h2 className="mt-3 font-serif text-3xl font-semibold">
            等待你的下一次划词
          </h2>
          <p className="text-muted mt-3 text-sm leading-7">
            当模拟或真实划词事件到达时，这里会展示一个更接近成品状态的玻璃拟态
            Popup，而不再只是简单的文本块。
          </p>
        </div>
      )}
    </div>
  )
}
