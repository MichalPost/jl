import { useEffect, useMemo, useRef, useState } from "react"
import { Command, CornerDownLeft, LoaderCircle, Search, Sparkles } from "lucide-react"
import { searchPluginSpotlight, runPluginSpotlightSelection } from "@/lib/plugins"
import { tauriApi } from "@/lib/tauri"
import type { Item, PluginSpotlightResult } from "@/types"
import { cn } from "@/utils/cn"

type SpotlightResult =
  | {
      id: string
      title: string
      subtitle: string
      source: "local"
      itemId: string
    }
  | PluginSpotlightResult

function toLocalResult(item: Item): SpotlightResult {
  return {
    id: item.id,
    itemId: item.id,
    title: item.text,
    subtitle: `${item.type.toUpperCase()} · ${item.source.title ?? item.source.appName ?? "来源未知"}`,
    source: "local",
  }
}

export default function SearchSpotlight() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [results, setResults] = useState<SpotlightResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, 200)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const handleBlur = () => {
      void tauriApi.hideSpotlight()
    }

    window.addEventListener("blur", handleBlur)
    return () => window.removeEventListener("blur", handleBlur)
  }, [])

  useEffect(() => {
    let active = true
    setIsLoading(true)

    void (async () => {
      const localResults = debouncedQuery
        ? await tauriApi.searchItems(debouncedQuery)
        : await tauriApi.listItems()
      const pluginResults = debouncedQuery
        ? await searchPluginSpotlight(debouncedQuery)
        : []

      if (!active) {
        return
      }

      setResults([
        ...localResults.slice(0, debouncedQuery ? 20 : 8).map(toLocalResult),
        ...pluginResults,
      ])
      setSelectedIndex(0)
      setIsLoading(false)
    })()

    return () => {
      active = false
    }
  }, [debouncedQuery])

  const activeResult = useMemo(
    () => results[selectedIndex] ?? null,
    [results, selectedIndex],
  )

  async function openResult(result: SpotlightResult | null) {
    if (!result) {
      return
    }

    if (result.source === "local") {
      await tauriApi.showTaskManagerWindow(result.itemId)
      await tauriApi.hideSpotlight()
      return
    }

    await runPluginSpotlightSelection(result)
    await tauriApi.hideSpotlight()
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_20%),radial-gradient(circle_at_bottom,_rgba(16,185,129,0.12),_transparent_18%),linear-gradient(180deg,_oklch(97.5%_0.01_270)_0%,_oklch(94.5%_0.012_270)_100%)] p-4 sm:p-6"
      onClick={() => void tauriApi.hideSpotlight()}
    >
      <div
        className="border-border/70 bg-surface/80 w-full max-w-3xl rounded-[28px] border p-4 shadow-[0_34px_90px_rgba(15,23,42,0.16)] backdrop-blur-[--blur-glass] sm:rounded-[32px] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-muted text-xs tracking-[0.3em] uppercase">
              Search Spotlight
            </p>
            <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">
              在一瞬间，找回你曾经划下的重点。
            </h1>
          </div>
          <div className="bg-primary/10 text-primary rounded-2xl p-3">
            <Command className="size-5" />
          </div>
        </div>

        <div
          className="border-border/70 bg-bg/82 flex items-center gap-3 rounded-[24px] border px-4 py-4"
          onClick={(event) => event.stopPropagation()}
        >
          <Search className="text-muted size-5" />
          <input
            ref={inputRef}
            className="text-text placeholder:text-muted min-w-0 flex-1 bg-transparent text-base outline-none"
            placeholder="搜索 text、source、context、tags..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setSelectedIndex((value) => Math.min(value + 1, Math.max(results.length - 1, 0)))
              }
              if (event.key === "ArrowUp") {
                event.preventDefault()
                setSelectedIndex((value) => Math.max(value - 1, 0))
              }
              if (event.key === "Enter") {
                event.preventDefault()
                void openResult(activeResult)
              }
              if (event.key === "Escape") {
                event.preventDefault()
                void tauriApi.hideSpotlight()
              }
            }}
          />
          <span className="text-muted border-border/70 hidden rounded-full border px-3 py-1 text-xs sm:inline-flex">
            Alt + Space
          </span>
        </div>

        <div
          className="mt-5 grid max-h-[55vh] gap-3 overflow-y-auto pr-1 sm:max-h-[50vh]"
          onClick={(event) => event.stopPropagation()}
        >
          {isLoading ? (
            <div className="text-muted flex items-center justify-center gap-2 rounded-[24px] border border-border/60 bg-surface/72 px-4 py-8 text-sm">
              <LoaderCircle className="size-4 animate-spin" />
              正在检索...
            </div>
          ) : results.length ? (
            results.map((result, index) => (
              <button
                key={result.id}
                type="button"
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => void openResult(result)}
                className={cn(
                  "border-border/70 hover:border-primary/50 hover:bg-primary/8 rounded-[24px] border bg-surface/72 p-4 text-left transition",
                  index === selectedIndex && "border-primary bg-primary/8",
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm leading-7 sm:text-base">
                      {result.title}
                    </p>
                    <p className="text-muted mt-2 text-xs sm:text-sm">
                      {result.subtitle}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted rounded-full bg-bg/70 px-2.5 py-1 text-[11px]">
                      {result.source === "local" ? "本地" : "插件"}
                    </span>
                    <Sparkles className="text-primary mt-1 size-4 shrink-0" />
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="border-border/70 bg-surface/72 rounded-[24px] border px-4 py-8 text-center">
              <p className="text-sm font-medium">没有匹配结果</p>
              <p className="text-muted mt-2 text-xs">试试换一个关键词。</p>
            </div>
          )}
        </div>

        <div className="text-muted mt-5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span>支持 text / source / context / tags 的快速命中</span>
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft className="size-3" />
            Enter 打开对应条目
          </span>
        </div>
      </div>
    </div>
  )
}
