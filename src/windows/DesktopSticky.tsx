import { useEffect, useMemo, useState } from "react"
import { GripVertical, X } from "lucide-react"
import { tauriApi } from "@/lib/tauri"
import type { StickyState } from "@/types"

function extractStickyId(label: string | null) {
  if (!label?.startsWith("sticky-")) {
    return null
  }

  return label.slice("sticky-".length)
}

export default function DesktopSticky() {
  const [sticky, setSticky] = useState<StickyState | null>(null)
  const [isClosing, setIsClosing] = useState(false)

  const stickyId = useMemo(async () => {
    const label = await tauriApi.getCurrentWindowLabel()
    return extractStickyId(label ?? null)
  }, [])

  useEffect(() => {
    let mounted = true

    void (async () => {
      const resolvedStickyId = await stickyId
      const stickies = await tauriApi.listStickies()
      if (!mounted) {
        return
      }
      setSticky(stickies.find((item) => item.id === resolvedStickyId) ?? null)
    })()

    return () => {
      mounted = false
    }
  }, [stickyId])

  async function syncWindowPosition() {
    const resolvedStickyId = await stickyId
    const position = await tauriApi.getCurrentWindowOuterPosition()
    if (!resolvedStickyId || !position) {
      return
    }

    await tauriApi.updateStickyPosition(
      resolvedStickyId,
      position.x,
      position.y,
    )
  }

  async function handleDragStart() {
    await tauriApi.startCurrentWindowDragging()
    await syncWindowPosition()
  }

  async function handleClose() {
    const resolvedStickyId = await stickyId
    if (!resolvedStickyId || isClosing) {
      return
    }

    setIsClosing(true)
    await tauriApi.closeSticky(resolvedStickyId)
    await tauriApi.closeCurrentWindow()
  }

  return (
    <div className="min-h-screen bg-transparent p-2">
      <div className="w-full max-w-[min(19rem,calc(100vw-1rem))] rounded-[22px] border border-amber-300/60 bg-amber-100/92 p-3 text-amber-950 shadow-[0_18px_42px_rgba(120,53,15,0.22)] backdrop-blur sm:max-w-[19rem]">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onMouseDown={() => void handleDragStart()}
            className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-white/35 px-2 py-1 text-[11px] font-medium text-amber-900/80 transition hover:bg-white/45"
          >
            <GripVertical className="size-3.5" />
            拖动
          </button>
          <button
            type="button"
            onClick={() => void handleClose()}
            className="inline-flex size-8 items-center justify-center rounded-full border border-amber-400/50 bg-white/35 text-amber-900/80 transition hover:bg-white/45"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 break-words whitespace-pre-wrap">
          {sticky?.text ?? "便利贴内容载入中..."}
        </p>
      </div>
    </div>
  )
}
