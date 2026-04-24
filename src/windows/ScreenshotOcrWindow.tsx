import { useEffect, useMemo, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { CornerDownLeft, LoaderCircle, RotateCcw, ScanSearch, X } from "lucide-react"
import { toast } from "sonner"
import {
  emitSelectionFromFrontendOcr,
  executeOcrWithFallback,
} from "@/lib/ocr"
import { isTauriEnvironment, listen, tauriApi } from "@/lib/tauri"
import type { ScreenshotSession } from "@/types"
import { toErrorMessage } from "@/utils/error"

type Point = { x: number; y: number }
type SelectionRect = { left: number; top: number; width: number; height: number }
type BoundsRect = { left: number; top: number; width: number; height: number }

const MIN_SELECTION_SIZE = 24
const SNAP_THRESHOLD = 10

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function buildSelectionRect(start: Point, current: Point): SelectionRect {
  const left = Math.min(start.x, current.x)
  const top = Math.min(start.y, current.y)
  const width = Math.abs(current.x - start.x)
  const height = Math.abs(current.y - start.y)
  return { left, top, width, height }
}

function snapValue(value: number, candidates: number[]) {
  let snapped = value
  let bestDistance = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    const distance = Math.abs(value - candidate)
    if (distance <= SNAP_THRESHOLD && distance < bestDistance) {
      snapped = candidate
      bestDistance = distance
    }
  }

  return snapped
}

function toViewportRect(
  session: ScreenshotSession,
  imageRect: DOMRect,
  bounds: BoundsRect,
): SelectionRect {
  const scaleX = imageRect.width / session.width
  const scaleY = imageRect.height / session.height
  return {
    left: imageRect.left + (bounds.left - session.originX) * scaleX,
    top: imageRect.top + (bounds.top - session.originY) * scaleY,
    width: bounds.width * scaleX,
    height: bounds.height * scaleY,
  }
}

function toVirtualRect(
  session: ScreenshotSession,
  imageRect: DOMRect,
  selection: SelectionRect,
): BoundsRect {
  const scaleX = session.width / imageRect.width
  const scaleY = session.height / imageRect.height
  return {
    left: Math.round(session.originX + (selection.left - imageRect.left) * scaleX),
    top: Math.round(session.originY + (selection.top - imageRect.top) * scaleY),
    width: Math.max(1, Math.round(selection.width * scaleX)),
    height: Math.max(1, Math.round(selection.height * scaleY)),
  }
}

function cropSelectionToDataUrl(
  image: HTMLImageElement,
  selection: SelectionRect,
  imageRect: DOMRect,
) {
  const scaleX = image.naturalWidth / imageRect.width
  const scaleY = image.naturalHeight / imageRect.height
  const sourceX = Math.round((selection.left - imageRect.left) * scaleX)
  const sourceY = Math.round((selection.top - imageRect.top) * scaleY)
  const sourceWidth = Math.max(1, Math.round(selection.width * scaleX))
  const sourceHeight = Math.max(1, Math.round(selection.height * scaleY))
  const canvas = document.createElement("canvas")
  canvas.width = sourceWidth
  canvas.height = sourceHeight
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("无法创建截图裁剪画布")
  }
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight,
  )
  return canvas.toDataURL("image/png")
}

export default function ScreenshotOcrWindow() {
  const [session, setSession] = useState<ScreenshotSession | null>(null)
  const [startPoint, setStartPoint] = useState<Point | null>(null)
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null)
  const [committedSelection, setCommittedSelection] = useState<SelectionRect | null>(
    null,
  )
  const [isProcessing, setIsProcessing] = useState(false)
  const [showLongWait, setShowLongWait] = useState(false)
  const [sizeHint, setSizeHint] = useState<string | null>(null)
  const [lastCapture, setLastCapture] = useState<{
    imageDataUrl: string
    x: number
    y: number
  } | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  const draftSelection = useMemo(() => {
    if (!startPoint || !currentPoint) {
      return null
    }
    return buildSelectionRect(startPoint, currentPoint)
  }, [currentPoint, startPoint])

  const selection = draftSelection ?? committedSelection

  const pointer = useMemo(() => currentPoint ?? startPoint, [currentPoint, startPoint])

  const imageBounds = useMemo(() => imageRef.current?.getBoundingClientRect() ?? null, [
    session,
    committedSelection,
    draftSelection,
    isProcessing,
  ])

  const displayOverlays = useMemo(() => {
    if (!session || !imageBounds) {
      return []
    }

    return session.displays.map((display) => ({
      ...display,
      viewport: toViewportRect(session, imageBounds, {
        left: display.x,
        top: display.y,
        width: display.width,
        height: display.height,
      }),
    }))
  }, [imageBounds, session])

  const selectionMetrics = useMemo(() => {
    if (!selection || !session || !imageBounds) {
      return null
    }

    const virtual = toVirtualRect(session, imageBounds, selection)
    return {
      width: Math.round(selection.width),
      height: Math.round(selection.height),
      screenX: virtual.left,
      screenY: virtual.top,
      physicalWidth: virtual.width,
      physicalHeight: virtual.height,
    }
  }, [imageBounds, selection, session])

  useEffect(() => {
    let cleanup = () => {}

    void tauriApi.getPendingScreenshotSession().then((pending) => {
      if (pending) {
        setSession(pending)
      }
    })

    void listen<ScreenshotSession>("screenshot-selection-started", (payload) => {
      setSession(payload)
      setStartPoint(null)
      setCurrentPoint(null)
      setCommittedSelection(null)
      setIsProcessing(false)
      setShowLongWait(false)
      setSizeHint(null)
    }).then((unlisten) => {
      cleanup = unlisten
    })

    return () => cleanup()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void handleCancel()
        return
      }

      if (event.key === "Enter" && committedSelection && !isProcessing) {
        event.preventDefault()
        void handleSelectionComplete(committedSelection)
        return
      }

      if (
        (event.key.toLowerCase() === "r" && (event.ctrlKey || event.metaKey)) ||
        event.key.toLowerCase() === "r"
      ) {
        if (lastCapture && !isProcessing) {
          event.preventDefault()
          void retryLastCapture()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  })

  useEffect(() => {
    if (!isProcessing) {
      setShowLongWait(false)
      return undefined
    }

    const timer = window.setTimeout(() => {
      setShowLongWait(true)
    }, 5000)

    return () => window.clearTimeout(timer)
  }, [isProcessing])

  async function handleCancel() {
    setStartPoint(null)
    setCurrentPoint(null)
    setCommittedSelection(null)
    setIsProcessing(false)
    setShowLongWait(false)
    setSizeHint(null)
    setSession(null)
    await tauriApi.cancelScreenshotSelection()
    if (isTauriEnvironment()) {
      await tauriApi.hideScreenshotWindow()
    }
  }

  async function handleSelectionComplete(nextSelection: SelectionRect) {
    const image = imageRef.current
    if (!image || !session) {
      return
    }

    const imageRect = image.getBoundingClientRect()
    const minX = imageRect.left
    const maxX = imageRect.right
    const minY = imageRect.top
    const maxY = imageRect.bottom
    const clampedSelection: SelectionRect = {
      left: clamp(nextSelection.left, minX, maxX),
      top: clamp(nextSelection.top, minY, maxY),
      width: Math.min(nextSelection.width, maxX - nextSelection.left),
        height: Math.min(nextSelection.height, maxY - nextSelection.top),
    }

    if (
      clampedSelection.width < MIN_SELECTION_SIZE ||
      clampedSelection.height < MIN_SELECTION_SIZE
    ) {
      setSizeHint(`选区至少需要 ${MIN_SELECTION_SIZE}px × ${MIN_SELECTION_SIZE}px`)
      return
    }

    try {
      setIsProcessing(true)
      setSizeHint(null)
      const imageDataUrl = cropSelectionToDataUrl(image, clampedSelection, imageRect)
      const virtualSelection = toVirtualRect(session, imageRect, clampedSelection)
      const anchorX = virtualSelection.left + virtualSelection.width / 2
      const anchorY = virtualSelection.top + virtualSelection.height + 12
      setLastCapture({
        imageDataUrl,
        x: anchorX,
        y: anchorY,
      })
      const settings = await tauriApi.getSettings()
      const result = await executeOcrWithFallback(
        {
          imageDataUrl,
          x: anchorX,
          y: anchorY,
        },
        settings,
        { emitSelection: true },
      )

      if (result.status !== "success") {
        throw new Error(result.errorMessage || "未能识别文字，请重试")
      }

      if (result.runtime !== "rust") {
        await emitSelectionFromFrontendOcr(result, {
          imageDataUrl,
          x: anchorX,
          y: anchorY,
        })
      }

      toast.success(`OCR 完成 · ${result.provider}`, {
        description: result.text.slice(0, 80),
        duration: 2200,
      })
      await handleCancel()
    } catch (error) {
      toast.error("截图 OCR 失败", {
        description: toErrorMessage(error),
        duration: 2800,
      })
      setIsProcessing(false)
    }
  }

  async function retryLastCapture() {
    if (!lastCapture) {
      return
    }

    try {
      setIsProcessing(true)
      const settings = await tauriApi.getSettings()
      const result = await executeOcrWithFallback(
        {
          imageDataUrl: lastCapture.imageDataUrl,
          x: lastCapture.x,
          y: lastCapture.y,
        },
        settings,
        { emitSelection: true },
      )

      if (result.status !== "success") {
        throw new Error(result.errorMessage || "未能识别文字，请重试")
      }

      if (result.runtime !== "rust") {
        await emitSelectionFromFrontendOcr(result, {
          imageDataUrl: lastCapture.imageDataUrl,
          x: lastCapture.x,
          y: lastCapture.y,
        })
      }

      toast.success(`OCR 重试成功 · ${result.provider}`, {
        description: result.text.slice(0, 80),
        duration: 2200,
      })
      await handleCancel()
    } catch (error) {
      toast.error("重试识别失败", {
        description: toErrorMessage(error),
        duration: 2800,
      })
      setIsProcessing(false)
    }
  }

  function toPoint(event: ReactPointerEvent<HTMLDivElement>): Point {
    return { x: event.clientX, y: event.clientY }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!session || isProcessing) {
      return
    }

    setCommittedSelection(null)
    setSizeHint(null)
    setStartPoint(toPoint(event))
    setCurrentPoint(toPoint(event))
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!startPoint || isProcessing) {
      return
    }

    const imageRect = imageRef.current?.getBoundingClientRect()
    if (!session || !imageRect) {
      setCurrentPoint(toPoint(event))
      return
    }

    const rawPoint = toPoint(event)
    const displayEdges = displayOverlays.flatMap((display) => [
      display.viewport.left,
      display.viewport.left + display.viewport.width,
      display.viewport.top,
      display.viewport.top + display.viewport.height,
    ])

    const snappedPoint = {
      x: snapValue(rawPoint.x, displayEdges.filter((_, index) => index % 4 < 2)),
      y: snapValue(rawPoint.y, displayEdges.filter((_, index) => index % 4 >= 2)),
    }

    setCurrentPoint(snappedPoint)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!startPoint || isProcessing) {
      return
    }

    const finalSelection = buildSelectionRect(startPoint, toPoint(event))
    setStartPoint(null)
    setCurrentPoint(null)
    if (
      finalSelection.width < MIN_SELECTION_SIZE ||
      finalSelection.height < MIN_SELECTION_SIZE
    ) {
      setSizeHint(`选区至少需要 ${MIN_SELECTION_SIZE}px × ${MIN_SELECTION_SIZE}px`)
      setCommittedSelection(null)
      return
    }

    setSizeHint(null)
    setCommittedSelection(finalSelection)
  }

  function handleDoubleClick() {
    if (committedSelection && !isProcessing) {
      void handleSelectionComplete(committedSelection)
    }
  }

  return (
    <div
      className="relative h-screen w-screen cursor-crosshair overflow-hidden bg-slate-950/40"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    >
      {session ? (
        <img
          ref={imageRef}
          src={session.imageDataUrl}
          alt="Screenshot capture"
          className="h-full w-full select-none object-contain"
          draggable={false}
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <div className="rounded-[28px] border border-white/20 bg-slate-900/68 px-8 py-7 text-white shadow-2xl backdrop-blur-xl">
            <p className="text-xs tracking-[0.28em] uppercase text-slate-300">
              Screenshot OCR
            </p>
            <h2 className="mt-3 text-3xl font-semibold">等待截图会话</h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-200/88">
              按下截图快捷键后，这里会进入选区模式。浏览器调试模式下可以手动点下面的按钮加载 mock 截图。
            </p>
            {!isTauriEnvironment() ? (
              <button
                type="button"
                onClick={() => void tauriApi.startScreenshotSelection().then(setSession)}
                className="mt-5 rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-900"
              >
                加载 Mock 截图
              </button>
            ) : null}
          </div>
        </div>
      )}

      {session ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-slate-950/22" />
          {displayOverlays.map((display) => {
            const { viewport } = display
            return (
              <div
                key={display.id}
                className="pointer-events-none absolute border border-white/18"
                style={{
                  left: viewport.left,
                  top: viewport.top,
                  width: viewport.width,
                  height: viewport.height,
                }}
              >
                <div className="absolute top-3 left-3 rounded-full bg-slate-950/72 px-3 py-1 text-[11px] text-white shadow-lg backdrop-blur-xl">
                  {display.isPrimary ? "Primary" : "Display"} · {display.width} ×{" "}
                  {display.height}
                </div>
              </div>
            )
          })}
          {pointer ? (
            <>
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/28"
                style={{ left: pointer.x }}
              />
              <div
                className="pointer-events-none absolute left-0 right-0 h-px bg-white/28"
                style={{ top: pointer.y }}
              />
            </>
          ) : null}
          {selection ? (
            <>
              <div
                className="pointer-events-none absolute border-2 border-sky-400 bg-sky-300/12 shadow-[0_0_0_9999px_rgba(2,6,23,0.42)]"
                style={{
                  left: selection.left,
                  top: selection.top,
                  width: selection.width,
                  height: selection.height,
                }}
              />
              <div
                className="pointer-events-none absolute rounded-full bg-slate-950/78 px-3 py-1.5 text-xs font-medium text-white shadow-xl backdrop-blur-xl"
                style={{
                  left: Math.min(selection.left + 12, window.innerWidth - 220),
                  top: Math.max(selection.top - 42, 16),
                }}
              >
                {selectionMetrics?.width} × {selectionMetrics?.height}px
              </div>
              <div
                className="pointer-events-none absolute rounded-2xl border border-white/16 bg-slate-950/72 px-3 py-2 text-[11px] leading-5 text-slate-100 shadow-xl backdrop-blur-xl"
                style={{
                  left: Math.min(selection.left + selection.width + 16, window.innerWidth - 220),
                  top: Math.min(selection.top + 8, window.innerHeight - 80),
                }}
              >
                <div>X: {selectionMetrics?.screenX}</div>
                <div>Y: {selectionMetrics?.screenY}</div>
                <div>
                  Capture: {selectionMetrics?.physicalWidth} ×{" "}
                  {selectionMetrics?.physicalHeight}
                </div>
              </div>
            </>
          ) : null}
          <div className="absolute top-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/20 bg-slate-950/72 px-5 py-3 text-sm text-white shadow-2xl backdrop-blur-xl">
            {isProcessing ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <ScanSearch className="size-4" />
            )}
            <span>
              {isProcessing
                ? showLongWait
                  ? "识别时间较长，完成后会自动弹出结果"
                  : "正在执行 OCR"
                : committedSelection
                  ? "按 Enter 或双击确认识别，Esc 取消，R 重试最近一次"
                  : "拖拽选中截图区域，释放后进入确认状态"}
            </span>
            <button
              type="button"
              onClick={() => void handleCancel()}
              className="rounded-full border border-white/20 px-3 py-1 text-xs"
            >
              取消
            </button>
          </div>
          {committedSelection && !isProcessing ? (
            <div className="absolute right-6 bottom-6 z-10 flex items-center gap-3 rounded-[24px] border border-white/16 bg-slate-950/74 px-4 py-3 text-white shadow-2xl backdrop-blur-xl">
              <button
                type="button"
                onClick={() => void handleSelectionComplete(committedSelection)}
                className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950"
              >
                <CornerDownLeft className="size-4" />
                确认识别
              </button>
              {lastCapture ? (
                <button
                  type="button"
                  onClick={() => void retryLastCapture()}
                  className="flex items-center gap-2 rounded-full border border-white/18 px-4 py-2 text-sm"
                >
                  <RotateCcw className="size-4" />
                  重试最近一次
                </button>
              ) : null}
            </div>
          ) : null}
          {sizeHint ? (
            <div className="absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-full border border-amber-300/50 bg-amber-100/92 px-4 py-2 text-sm text-amber-950 shadow-xl">
              {sizeHint}
            </div>
          ) : null}
          <div className="absolute bottom-6 left-6 z-10 rounded-[24px] border border-white/14 bg-slate-950/72 px-4 py-3 text-xs text-white shadow-xl backdrop-blur-xl">
            <p className="tracking-[0.28em] uppercase text-slate-300">
              Virtual Screen
            </p>
            <p className="mt-2">
              {session.width} × {session.height}px
            </p>
            <p className="mt-1 text-slate-300">
              Origin: ({session.originX}, {session.originY})
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleCancel()}
            className="absolute top-6 right-6 rounded-full border border-white/20 bg-slate-950/70 p-3 text-white shadow-xl backdrop-blur-xl"
          >
            <X className="size-4" />
          </button>
        </>
      ) : null}
    </div>
  )
}
