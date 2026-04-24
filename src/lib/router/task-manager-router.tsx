import {
  Navigate,
  Outlet,
  RouterProvider,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  AlarmClockCheck,
  AlarmClockPlus,
  Archive,
  BadgeCheck,
  BookMarked,
  CheckCheck,
  CheckSquare2,
  ChevronRight,
  Cpu,
  FolderOpenDot,
  Globe,
  Highlighter,
  Layers3,
  LoaderCircle,
  PencilLine,
  RotateCcw,
  PlugZap,
  ScanSearch,
  SlidersHorizontal,
  Tags,
  Trash2,
  X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ProjectDialog } from "@/components/projects/ProjectDialog"
import { SettingsForm } from "@/components/settings/SettingsForm"
import { createOcrDemoImage, emitSelectionFromFrontendOcr, executeOcrWithFallback, listUnifiedOcrProviders } from "@/lib/ocr"
import { invalidatePluginRuntimeCache } from "@/lib/plugins"
import { listen, tauriApi } from "@/lib/tauri"
import { applyTheme } from "@/lib/theme/apply-theme"
import { TaskManagerLayout } from "@/windows/TaskManagerWindow"
import { SearchBar } from "@/components/shared/SearchBar"
import type {
  AppSettings,
  CreateProjectPayload,
  Item,
  ItemType,
  OcrProviderId,
  OcrResult,
  Project,
} from "@/types"
import { formatItemTime } from "@/utils/time"
import { cn } from "@/utils/cn"
import { filterItems } from "@/utils/search"
import { highlightMatch } from "@/utils/highlight"

const queryClient = new QueryClient()
const EMPTY_PROJECT_ROUTE_ID = "__empty__"

function ItemsChangedSync() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const cleanups: Array<() => void> = []

    void listen("items-changed", () => {
      void queryClient.invalidateQueries({ queryKey: ["items"] })
    }).then((unlisten) => {
      cleanups.push(unlisten)
    })

    void listen("projects-changed", () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] })
      void queryClient.invalidateQueries({ queryKey: ["items"] })
    }).then((unlisten) => {
      cleanups.push(unlisten)
    })

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [queryClient])

  return null
}

function RootComponent() {
  useEffect(() => {
    let cleanup = () => {}

    void listen<{ itemId?: string }>("task-manager-focus-item", (payload) => {
      window.location.hash = "#/inbox"
      window.dispatchEvent(
        new CustomEvent("textclip:focus-item", {
          detail: payload.itemId,
        }),
      )
    }).then((unlisten) => {
      cleanup = unlisten
    })

    return () => cleanup()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ItemsChangedSync />
      <TaskManagerLayout>
        <Outlet />
      </TaskManagerLayout>
    </QueryClientProvider>
  )
}

function Surface({
  children,
  className,
}: {
  children: import("react").ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "border-border/70 bg-bg/78 rounded-[30px] border p-5 shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur-[--blur-glass]",
        className,
      )}
    >
      {children}
    </div>
  )
}

function SectionTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string
  title: string
  subtitle: string
}) {
  return (
    <div className="mb-5">
      <p className="text-muted text-xs tracking-[0.28em] uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-2 font-serif text-3xl font-semibold">{title}</h2>
      <p className="text-muted mt-2 text-sm leading-6">{subtitle}</p>
    </div>
  )
}

async function saveSettingsAndRefresh(
  queryClient: QueryClient,
  payload: Partial<AppSettings>,
) {
  await tauriApi.saveSettings(payload)
  const nextSettings = await tauriApi.getSettings()
  applyTheme(nextSettings)
  void queryClient.setQueryData(["settings"], nextSettings)
  void queryClient.invalidateQueries({ queryKey: ["ocr-providers"] })
  return nextSettings
}

const itemTypeMeta: Record<
  ItemType,
  { label: string; icon: typeof BadgeCheck; tone: string }
> = {
  todo: {
    label: "TODO",
    icon: BadgeCheck,
    tone: "bg-emerald-500/10 text-emerald-700",
  },
  note: {
    label: "便签",
    icon: PencilLine,
    tone: "bg-sky-500/10 text-sky-700",
  },
  highlight: {
    label: "高亮",
    icon: Highlighter,
    tone: "bg-amber-500/10 text-amber-700",
  },
  read_later: {
    label: "稍后阅读",
    icon: BookMarked,
    tone: "bg-violet-500/10 text-violet-700",
  },
  sticky: {
    label: "便利贴",
    icon: Layers3,
    tone: "bg-rose-500/10 text-rose-700",
  },
}

/**
 * Renders `text` with occurrences of `query` wrapped in a highlighted <mark>.
 * Requirement 6.3 / 6.4: safe for empty, whitespace-only and special-char queries.
 */
function HighlightedText({
  text,
  query,
  className,
}: {
  text: string
  query: string
  className?: string
}) {
  const parts = highlightMatch(text, query)
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.matched ? (
          <mark
            key={i}
            className="bg-amber-200/80 text-amber-900 rounded-[3px] px-0.5"
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </span>
  )
}

function ItemCard({
  item,
  isActive,
  onClick,
  onDeleted,
  query = "",
  selectable = false,
  selected = false,
  onToggleSelected,
  draggable = false,
  onDragStart,
  onDragEnd,
}: {
  item: Item
  isActive: boolean
  onClick: () => void
  onDeleted?: () => void
  query?: string
  selectable?: boolean
  selected?: boolean
  onToggleSelected?: (next: boolean) => void
  draggable?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
}) {
  const meta = itemTypeMeta[item.type]
  const Icon = meta.icon
  const queryClient = useQueryClient()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const completeMutation = useMutation({
    mutationFn: () =>
      tauriApi.updateItem({ id: item.id, inbox: false, completed: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["items"] })
      toast.success("已标记为已处理")
    },
    onError: () => {
      toast.error("操作失败，请重试")
    },
  })

  const toggleCompleteMutation = useMutation({
    mutationFn: (completed: boolean) =>
      tauriApi.updateItem({ id: item.id, completed }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["items"] })
    },
    onError: () => {
      toast.error("操作失败，请重试")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => tauriApi.deleteItem(item.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["items"] })
      onDeleted?.()
    },
    onError: (error) => {
      console.error("[deleteItem]", error)
      toast.error("删除失败，请重试")
      setShowDeleteConfirm(false)
    },
  })

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "border-border/70 hover:border-primary/40 hover:bg-primary/6 flex w-full flex-col gap-4 rounded-[26px] border bg-surface/72 p-4 text-left transition",
        isActive &&
          "border-primary bg-primary/8 shadow-[0_16px_36px_rgba(99,102,241,0.12)]",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <button type="button" onClick={onClick} className="flex flex-col gap-4 text-left">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            {selectable ? (
              <input
                type="checkbox"
                checked={selected}
                onChange={(event) => {
                  event.stopPropagation()
                  onToggleSelected?.(event.target.checked)
                }}
                onClick={(event) => event.stopPropagation()}
                aria-label={`选择条目 ${item.text}`}
                className="size-4 shrink-0 cursor-pointer accent-[--app-primary-fallback,#2563eb]"
              />
            ) : null}
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
                meta.tone,
              )}
            >
              <Icon className="size-3.5" />
              <span>{meta.label}</span>
            </div>
          </div>
          <span className="text-muted text-xs">
            {formatItemTime(item.createdAt)}
          </span>
        </div>
        <div className="flex items-start gap-3">
          {item.type === "todo" && (
            <input
              type="checkbox"
              checked={item.completed}
              onChange={(e) => {
                e.stopPropagation()
                toggleCompleteMutation.mutate(e.target.checked)
              }}
              onClick={(e) => e.stopPropagation()}
              disabled={toggleCompleteMutation.isPending}
              className="mt-1 size-4 shrink-0 cursor-pointer accent-emerald-600"
            />
          )}
          <div className="min-w-0 flex-1">
            <h3
              className={cn(
                "text-text line-clamp-2 text-base leading-7 font-medium",
                item.type === "todo" && item.completed && "line-through text-muted",
              )}
            >
              <HighlightedText text={item.text} query={query} />
            </h3>
            <p className="text-muted mt-2 text-sm">
              {item.source.title ?? item.source.appName ?? "来源未知"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.tags.length ? (
            item.tags.map((tag) => (
              <span
                key={tag}
                className="bg-surface/85 text-muted rounded-full px-3 py-1 text-xs"
              >
                #{tag}
              </span>
            ))
          ) : (
            <span className="text-muted text-xs">未添加标签</span>
          )}
        </div>
      </button>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            completeMutation.mutate()
          }}
          disabled={completeMutation.isPending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
            "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20",
            completeMutation.isPending && "opacity-50 cursor-not-allowed",
          )}
        >
          <CheckCheck className="size-3.5" />
          {completeMutation.isPending ? "处理中..." : "已处理"}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setShowDeleteConfirm(true)
          }}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition bg-red-500/10 text-red-600 hover:bg-red-500/20"
        >
          <Trash2 className="size-3.5" />
          删除
        </button>
      </div>
      {showDeleteConfirm && (
        <div className="border-border/50 dark:border-red-500/25 rounded-[18px] border bg-red-500/10 px-4 py-3">
          <p className="text-sm font-medium text-red-600 dark:text-red-300">确认删除？</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                deleteMutation.mutate()
              }}
              disabled={deleteMutation.isPending}
              className={cn(
                "inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700",
                deleteMutation.isPending && "opacity-50 cursor-not-allowed",
              )}
            >
              {deleteMutation.isPending ? "删除中..." : "确认"}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowDeleteConfirm(false)
              }}
              disabled={deleteMutation.isPending}
              className="border-border/50 text-muted hover:text-text inline-flex items-center gap-1 rounded-full border bg-surface/78 px-3 py-1.5 text-xs font-medium transition hover:bg-surface"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

type InboxTypeFilter = "all" | ItemType
type InboxSortMode = "newest" | "oldest" | "reminder"

function sortInboxItems(items: Item[], sortMode: InboxSortMode) {
  const next = [...items]

  if (sortMode === "oldest") {
    return next.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  }

  if (sortMode === "reminder") {
    return next.sort((left, right) => {
      const leftTime = left.remindAt ? Date.parse(left.remindAt) : Number.MAX_SAFE_INTEGER
      const rightTime = right.remindAt ? Date.parse(right.remindAt) : Number.MAX_SAFE_INTEGER

      if (leftTime !== rightTime) {
        return leftTime - rightTime
      }

      return right.createdAt.localeCompare(left.createdAt)
    })
  }

  return next.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

function ItemDetailPanel({
  item,
  onBack,
  projects,
}: {
  item: Item
  onBack: () => void
  projects: Project[]
}) {
  const queryClient = useQueryClient()
  const [tagInput, setTagInput] = useState("")
  const [remindAtInput, setRemindAtInput] = useState("")
  const tagInputRef = useRef<HTMLInputElement>(null)

  const moveMutation = useMutation({
    mutationFn: (projectId: string) =>
      tauriApi.updateItem({ id: item.id, inbox: false, projectId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["items"] })
      toast.success("已移入项目夹")
    },
    onError: () => {
      toast.error("移入项目夹失败，请重试")
    },
  })

  const tagsMutation = useMutation({
    mutationFn: (newTags: string[]) =>
      tauriApi.updateItem({ id: item.id, tags: newTags }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["items"] })
    },
    onError: () => {
      toast.error("标签更新失败，请重试")
    },
  })

  const reminderMutation = useMutation({
    mutationFn: (remindAt: string | null) =>
      tauriApi.updateItem({ id: item.id, remindAt }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["items"] })
      toast.success("提醒已更新")
    },
    onError: () => {
      toast.error("提醒更新失败，请重试")
    },
  })

  useEffect(() => {
    if (!item.remindAt) {
      setRemindAtInput("")
      return
    }

    const date = new Date(item.remindAt)
    if (Number.isNaN(date.getTime())) {
      setRemindAtInput("")
      return
    }

    const offset = date.getTimezoneOffset()
    const localDate = new Date(date.getTime() - offset * 60_000)
    setRemindAtInput(localDate.toISOString().slice(0, 16))
  }, [item.id, item.remindAt])

  function addTag(raw: string) {
    const tag = raw.trim().replace(/^#/, "")
    if (!tag || item.tags.includes(tag)) return
    tagsMutation.mutate([...item.tags, tag])
    setTagInput("")
  }

  function removeTag(tag: string) {
    tagsMutation.mutate(item.tags.filter((t) => t !== tag))
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      addTag(tagInput)
    }
  }

  return (
    <div className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-muted text-xs tracking-[0.24em] uppercase">
          Active Detail
        </p>
        <button
          type="button"
          onClick={onBack}
          className="text-muted hover:text-text inline-flex items-center gap-1 text-xs xl:hidden"
        >
          返回列表
          <ChevronRight className="size-3" />
        </button>
      </div>
      <h3 className="mt-3 text-2xl leading-9 font-semibold">{item.text}</h3>

      {item.type === "note" && (
        <div className="mt-4 rounded-[24px] bg-surface/66 p-4">
          <p className="text-muted text-xs uppercase">内容</p>
          <pre className="mt-2 whitespace-pre-wrap text-sm leading-7 font-sans">
            {item.text}
          </pre>
        </div>
      )}

      <div className="mt-5 grid gap-4">
        {/* Source */}
        <div className="rounded-[24px] bg-surface/66 p-4">
          <p className="text-muted text-xs uppercase">Source</p>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <Globe className="text-primary size-4" />
            {item.source.title ?? item.source.appName ?? "来源未知"}
          </p>
          {item.source.url && (
            <p className="text-muted mt-1 truncate text-xs">{item.source.url}</p>
          )}
        </div>

        {/* Context */}
        <div className="rounded-[24px] bg-surface/66 p-4">
          <p className="text-muted text-xs uppercase">Context</p>
          <p className="mt-2 text-sm leading-7">
            {item.context.before || "前文为空"}
          </p>
          <p className="text-muted mt-2 text-sm leading-7">
            {item.context.after || "后文为空"}
          </p>
        </div>

        {/* Tags */}
        <div className="rounded-[24px] bg-surface/66 p-4">
          <p className="text-muted text-xs uppercase">Tags</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs"
              >
                #{tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="hover:text-primary/60 ml-0.5"
                  aria-label={`删除标签 ${tag}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="border-border/50 mt-3 flex items-center gap-2 rounded-full border bg-surface/62 px-3 py-1.5">
            <input
              ref={tagInputRef}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder="添加标签，回车或空格确认"
              className="text-text placeholder:text-muted min-w-0 flex-1 bg-transparent text-xs outline-none"
            />
          </div>
        </div>

        {/* RemindAt */}
        {item.remindAt && (
          <div className="rounded-[24px] bg-surface/66 p-4">
            <p className="text-muted text-xs uppercase">Remind At</p>
            <p className="mt-2 text-sm">{item.remindAt}</p>
          </div>
        )}

        <div className="rounded-[24px] bg-surface/66 p-4">
          <div className="flex items-center gap-2">
            <AlarmClockPlus className="text-primary size-4" />
            <p className="text-muted text-xs uppercase">提醒</p>
          </div>
          <input
            type="datetime-local"
            value={remindAtInput}
            onChange={(event) => setRemindAtInput(event.target.value)}
            className="border-border/50 text-text mt-3 w-full rounded-[16px] border bg-surface/74 px-3 py-2 text-sm outline-none"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={reminderMutation.isPending || !remindAtInput}
              onClick={() => {
                const nextIso = new Date(remindAtInput).toISOString()
                reminderMutation.mutate(nextIso)
              }}
              className="bg-primary hover:bg-primary/90 rounded-full px-3 py-1.5 text-xs font-medium text-white transition disabled:cursor-wait disabled:opacity-70"
            >
              保存提醒
            </button>
            <button
              type="button"
              disabled={reminderMutation.isPending || !item.remindAt}
              onClick={() => reminderMutation.mutate(null)}
              className="border-border/50 text-muted hover:text-text rounded-full border bg-surface/78 px-3 py-1.5 text-xs font-medium transition"
            >
              取消提醒
            </button>
          </div>
        </div>

        {/* Move to project */}
        <div className="rounded-[24px] bg-surface/66 p-4">
          <p className="text-muted text-xs uppercase">移入项目夹</p>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) moveMutation.mutate(e.target.value)
            }}
            disabled={moveMutation.isPending}
            className={cn(
              "border-border/50 text-text mt-2 w-full rounded-[16px] border bg-surface/74 px-3 py-2 text-sm outline-none transition",
              moveMutation.isPending && "opacity-50 cursor-not-allowed",
            )}
          >
            <option value="" disabled>
              {moveMutation.isPending ? "移入中..." : "选择项目夹..."}
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

function InboxView() {
  const queryClient = useQueryClient()
  const itemsQuery = useQuery({
    queryKey: ["items"],
    queryFn: tauriApi.listItems,
  })
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: tauriApi.listProjects,
  })
  // debouncedQuery is set by SearchBar after 300ms of inactivity (Req 6.2)
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [activeId, setActiveId] = useState<string>()
  const [showDetailOnMobile, setShowDetailOnMobile] = useState(false)
  const [typeFilter, setTypeFilter] = useState<InboxTypeFilter>("all")
  const [sortMode, setSortMode] = useState<InboxSortMode>("newest")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [draggedItemId, setDraggedItemId] = useState<string>()
  const [hoveredProjectId, setHoveredProjectId] = useState<string>()
  const [batchTagInput, setBatchTagInput] = useState("")

  const batchMutation = useMutation({
    mutationFn: async ({
      ids,
      action,
      projectId,
    }: {
      ids: string[]
      action: "complete" | "move"
      projectId?: string
    }) => {
      await Promise.all(
        ids.map((id) => {
          if (action === "complete") {
            return tauriApi.updateItem({ id, completed: true, inbox: false })
          }

          return tauriApi.updateItem({ id, inbox: false, projectId })
        }),
      )
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["items"] })
      setSelectedIds([])
      toast.success(
        variables.action === "complete" ? "批量标记完成成功" : "批量移入项目夹成功",
      )
    },
    onError: () => {
      toast.error("批量操作失败，请重试")
    },
  })

  const batchTagMutation = useMutation({
    mutationFn: async ({ ids, rawTag }: { ids: string[]; rawTag: string }) => {
      const nextTag = rawTag.trim().replace(/^#/, "")
      if (!nextTag) {
        throw new Error("请输入标签")
      }

      await Promise.all(
        ids.map((id) => {
          const item = items.find((entry) => entry.id === id)
          if (!item) {
            return Promise.resolve()
          }

          const nextTags = Array.from(new Set([...item.tags, nextTag]))
          return tauriApi.updateItem({ id, tags: nextTags })
        }),
      )

      return nextTag
    },
    onSuccess: (tag) => {
      void queryClient.invalidateQueries({ queryKey: ["items"] })
      setBatchTagInput("")
      toast.success(`已为所选条目添加标签 #${tag}`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "批量加标签失败")
    },
  })

  const moveItemsToProject = useCallback(
    async (ids: string[], projectId: string) => {
      await Promise.all(
        ids.map((id) => tauriApi.updateItem({ id, inbox: false, projectId })),
      )
      await queryClient.invalidateQueries({ queryKey: ["items"] })
      setSelectedIds([])
      setHoveredProjectId(undefined)
      setDraggedItemId(undefined)
      toast.success("已移入项目夹")
    },
    [queryClient],
  )

  const handleSearch = useCallback((q: string) => {
    setDebouncedQuery(q)
  }, [])

  const items = itemsQuery.data ?? []
  const projects = projectsQuery.data ?? []
  const inboxItems = useMemo(() => items.filter((item) => item.inbox), [items])

  // Req 6.2 / 6.5: case-insensitive multi-field filter; Req 6.4: empty query → all results
  // Uses filterItems from src/utils/search.ts, aligned with backend search_items behaviour
  const filtered = useMemo(() => {
    const searched = filterItems(inboxItems, debouncedQuery)
    const typed =
      typeFilter === "all"
        ? searched
        : searched.filter((item) => item.type === typeFilter)
    return sortInboxItems(typed, sortMode)
  }, [debouncedQuery, inboxItems, sortMode, typeFilter])

  const activeItem =
    filtered.find((item) => item.id === activeId) ?? filtered[0]

  const selectedCount = selectedIds.length
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((item) => selectedIds.includes(item.id))
  const pendingCount = inboxItems.filter((item) => !item.completed).length
  const reminderCount = inboxItems.filter((item) => Boolean(item.remindAt)).length
  const todoCount = inboxItems.filter((item) => item.type === "todo").length
  const draggedSelectionIds =
    draggedItemId && selectedIds.includes(draggedItemId)
      ? selectedIds
      : draggedItemId
        ? [draggedItemId]
        : []

  useEffect(() => {
    setSelectedIds((current) =>
      current.filter((id) => inboxItems.some((item) => item.id === id)),
    )
  }, [inboxItems])

  useEffect(() => {
    const handleFocusItem = (event: Event) => {
      const customEvent = event as CustomEvent<string | undefined>
      if (!customEvent.detail) {
        return
      }

      setActiveId(customEvent.detail)
      setShowDetailOnMobile(true)
    }

    window.addEventListener("textclip:focus-item", handleFocusItem as EventListener)
    return () =>
      window.removeEventListener(
        "textclip:focus-item",
        handleFocusItem as EventListener,
      )
  }, [])

  return (
    <div className="grid min-w-0 gap-6">
      <Surface>
        <SectionTitle
          eyebrow="Inbox"
          title="捕获队列"
          subtitle={`这里展示当前仍在 Inbox 中的捕获条目。现有 ${inboxItems.length} 条待整理内容，现在可以直接筛选、排序并批量处理。`}
        />
        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-[24px] bg-surface/72 p-4">
            <p className="text-muted text-xs uppercase">待整理</p>
            <p className="mt-2 text-2xl font-semibold">{pendingCount}</p>
          </div>
          <div className="rounded-[24px] bg-surface/72 p-4">
            <p className="text-muted text-xs uppercase">待提醒</p>
            <p className="mt-2 text-2xl font-semibold">{reminderCount}</p>
          </div>
          <div className="rounded-[24px] bg-surface/72 p-4">
            <p className="text-muted text-xs uppercase">TODO 条目</p>
            <p className="mt-2 text-2xl font-semibold">{todoCount}</p>
          </div>
        </div>
        <div className="mb-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[26px] border border-border/70 bg-surface/72 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Archive className="text-primary size-4" />
              <p className="text-sm font-medium">拖拽到项目夹</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {projects.map((project) => (
                <div
                  key={project.id}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setHoveredProjectId(project.id)
                  }}
                  onDragLeave={() => {
                    setHoveredProjectId((current) =>
                      current === project.id ? undefined : current,
                    )
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (draggedSelectionIds.length === 0) {
                      return
                    }
                    void moveItemsToProject(draggedSelectionIds, project.id)
                  }}
                  className={cn(
                    "rounded-[22px] border border-border/60 bg-bg/84 px-4 py-4 transition",
                    hoveredProjectId === project.id &&
                      "border-primary bg-primary/10 shadow-[0_10px_28px_rgba(99,102,241,0.12)]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <FolderOpenDot className="text-primary size-4" />
                    <span className="text-sm font-medium">{project.name}</span>
                  </div>
                  <p className="text-muted mt-2 text-xs leading-6">
                    {draggedSelectionIds.length > 1
                      ? `松手即可一次归档 ${draggedSelectionIds.length} 条`
                      : "把条目拖到这里即可归档"}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[26px] border border-border/70 bg-surface/72 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Tags className="text-primary size-4" />
              <p className="text-sm font-medium">批量加标签</p>
            </div>
            <div className="flex flex-col gap-3">
              <input
                value={batchTagInput}
                onChange={(event) => setBatchTagInput(event.target.value)}
                placeholder="输入标签，例如：重点"
                className="border-border/60 rounded-[18px] border bg-bg/84 px-4 py-3 text-sm outline-none"
              />
              <button
                type="button"
                disabled={
                  selectedCount === 0 ||
                  batchTagMutation.isPending ||
                  !batchTagInput.trim()
                }
                onClick={() =>
                  batchTagMutation.mutate({
                    ids: selectedIds,
                    rawTag: batchTagInput,
                  })
                }
                className="bg-primary hover:bg-primary/90 rounded-full px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-50"
              >
                {batchTagMutation.isPending
                  ? "标签追加中..."
                  : `为已选 ${selectedCount} 项添加标签`}
              </button>
              <p className="text-muted text-xs leading-6">
                适合先批量打上“待跟进 / 研究 / Bug / 稍后处理”等标签，再继续整理。
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
          <div className="min-w-0">
            {/* Req 6.1: search input with placeholder "搜索任务..." */}
            <SearchBar onSearch={handleSearch} className="mb-4" />
            <div className="mb-4 grid gap-3 rounded-[24px] border border-border/70 bg-surface/68 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted inline-flex items-center gap-2 text-xs uppercase">
                  <SlidersHorizontal className="size-3.5" />
                  筛选
                </span>
                {([
                  ["all", "全部"],
                  ["todo", "TODO"],
                  ["note", "便签"],
                  ["highlight", "高亮"],
                  ["read_later", "稍后阅读"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTypeFilter(value)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition",
                      typeFilter === value
                        ? "bg-primary text-white"
                        : "bg-primary/8 text-muted hover:text-text",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedIds(allVisibleSelected ? [] : filtered.map((item) => item.id))
                    }
                    className="border-border/60 inline-flex items-center gap-2 rounded-full border bg-bg/82 px-3 py-1.5 text-xs font-medium transition hover:border-primary/40"
                  >
                    <CheckSquare2 className="size-3.5" />
                    {allVisibleSelected ? "取消全选当前结果" : "全选当前结果"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    disabled={selectedCount === 0}
                    className="border-border/60 inline-flex items-center gap-2 rounded-full border bg-bg/82 px-3 py-1.5 text-xs font-medium transition disabled:opacity-50"
                  >
                    <RotateCcw className="size-3.5" />
                    清空选择
                  </button>
                  <span className="text-muted text-xs">
                    已选 {selectedCount} 项
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value as InboxSortMode)}
                    className="border-border/60 rounded-full border bg-bg/82 px-3 py-1.5 text-xs font-medium outline-none"
                  >
                    <option value="newest">按最新排序</option>
                    <option value="oldest">按最早排序</option>
                    <option value="reminder">按提醒时间排序</option>
                  </select>
                  <button
                    type="button"
                    disabled={selectedCount === 0 || batchMutation.isPending}
                    onClick={() =>
                      batchMutation.mutate({
                        ids: selectedIds,
                        action: "complete",
                      })
                    }
                    className="bg-emerald-600 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <CheckCheck className="size-3.5" />
                    批量已处理
                  </button>
                  <select
                    defaultValue=""
                    disabled={selectedCount === 0 || batchMutation.isPending}
                    onChange={(event) => {
                      if (!event.target.value) {
                        return
                      }
                      batchMutation.mutate({
                        ids: selectedIds,
                        action: "move",
                        projectId: event.target.value,
                      })
                      event.target.value = ""
                    }}
                    className="border-border/60 rounded-full border bg-bg/82 px-3 py-1.5 text-xs font-medium outline-none disabled:opacity-50"
                  >
                    <option value="">批量移入项目夹</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            {itemsQuery.isLoading ? (
              <div className="grid gap-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="border-border/60 h-36 animate-pulse rounded-[26px] border bg-surface/58"
                  />
                ))}
              </div>
            ) : filtered.length ? (
              <div className="grid gap-4">
                {filtered.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    isActive={activeItem?.id === item.id}
                    query={debouncedQuery}
                    selectable
                    draggable
                    selected={selectedIds.includes(item.id)}
                    onDragStart={() => setDraggedItemId(item.id)}
                    onDragEnd={() => {
                      setDraggedItemId(undefined)
                      setHoveredProjectId(undefined)
                    }}
                    onToggleSelected={(next) =>
                      setSelectedIds((current) =>
                        next
                          ? Array.from(new Set([...current, item.id]))
                          : current.filter((id) => id !== item.id),
                      )
                    }
                    onClick={() => {
                      setActiveId(item.id)
                      setShowDetailOnMobile(true)
                    }}
                    onDeleted={() => setActiveId(undefined)}
                  />
                ))}
              </div>
            ) : (
              <div className="border-border/70 bg-surface/75 rounded-[28px] border px-5 py-10 text-center">
                {debouncedQuery.trim() ? (
                  <>
                    {/* Req 6.3: no search results */}
                    <p className="text-lg font-semibold">未找到匹配的任务</p>
                    <p className="text-muted mt-2 text-sm">
                      尝试切换类型筛选、排序方式，或使用其他关键词搜索。
                    </p>
                  </>
                ) : (
                  <>
                    {/* Req 4.4: empty inbox */}
                    <p className="text-lg font-semibold">暂无内容，划选文字即可快速添加</p>
                    <p className="text-muted mt-2 text-sm">
                      新的条目会自动回流到这里。
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
          <Surface
            className={cn(
              "bg-surface/72 h-fit p-0",
              !showDetailOnMobile && "hidden xl:block",
              showDetailOnMobile && "block",
            )}
          >
            {activeItem ? (
              <ItemDetailPanel
                item={activeItem}
                onBack={() => setShowDetailOnMobile(false)}
                projects={projects}
              />
            ) : (
              <div className="p-5 text-sm text-slate-500">暂无内容</div>
            )}
          </Surface>
        </div>
      </Surface>
    </div>
  )
}

function ProjectView() {
  const navigate = useNavigate()
  const { id } = useParams({ from: "/project/$id" })
  const queryClient = useQueryClient()
  const itemsQuery = useQuery({
    queryKey: ["items"],
    queryFn: tauriApi.listItems,
  })
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: tauriApi.listProjects,
  })
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [dialogError, setDialogError] = useState<string>()

  const items = itemsQuery.data ?? []
  const projects = projectsQuery.data ?? []
  const currentProject =
    projects.find((project) => project.id === id) ?? null
  const projectItems = currentProject
    ? items
        .filter((item) => item.projectId === currentProject.id)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    : []

  useEffect(() => {
    if (projectsQuery.isLoading) {
      return
    }

    if (projects.length === 0) {
      if (id !== EMPTY_PROJECT_ROUTE_ID) {
        void navigate({ to: "/project/$id", params: { id: EMPTY_PROJECT_ROUTE_ID }, replace: true })
      }
      return
    }

    if (!currentProject) {
      void navigate({ to: "/project/$id", params: { id: projects[0].id }, replace: true })
    }
  }, [currentProject, id, navigate, projects, projectsQuery.isLoading])

  const createMutation = useMutation({
    mutationFn: (payload: CreateProjectPayload) => tauriApi.createProject(payload),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] })
      setDialogMode(null)
      setEditingProject(null)
      setDialogError(undefined)
      toast.success("项目夹已创建")
      void navigate({ to: "/project/$id", params: { id: project.id } })
    },
    onError: (error) => {
      setDialogError(error instanceof Error ? error.message : "创建项目失败")
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; values: CreateProjectPayload }) =>
      tauriApi.updateProject({
        id: payload.id,
        name: payload.values.name,
        color: payload.values.color,
        description: payload.values.description ?? null,
      }),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] })
      setDialogMode(null)
      setEditingProject(null)
      setDialogError(undefined)
      toast.success("项目夹已更新")
      void navigate({ to: "/project/$id", params: { id: project.id } })
    },
    onError: (error) => {
      setDialogError(error instanceof Error ? error.message : "更新项目失败")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (projectId: string) => tauriApi.deleteProject(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] })
      await queryClient.invalidateQueries({ queryKey: ["items"] })
      setDialogMode(null)
      setEditingProject(null)
      setDialogError(undefined)
      toast.success("项目夹已删除，关联条目已退回 Inbox")
      const nextProjects = await tauriApi.listProjects()
      void navigate({
        to: "/project/$id",
        params: { id: nextProjects[0]?.id ?? EMPTY_PROJECT_ROUTE_ID },
        replace: true,
      })
    },
    onError: (error) => {
      setDialogError(error instanceof Error ? error.message : "删除项目失败")
    },
  })

  const moveBackMutation = useMutation({
    mutationFn: (itemId: string) =>
      tauriApi.updateItem({ id: itemId, inbox: true, projectId: null }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["items"] })
      toast.success("条目已移回 Inbox")
    },
    onError: () => {
      toast.error("移回 Inbox 失败，请重试")
    },
  })

  function openCreateDialog() {
    setDialogError(undefined)
    setEditingProject(null)
    setDialogMode("create")
  }

  function openEditDialog(project: Project) {
    setDialogError(undefined)
    setEditingProject(project)
    setDialogMode("edit")
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Surface>
        <SectionTitle
          eyebrow="Project Folder"
          title="项目总览"
          subtitle="这里现在承接真实项目夹数据，可以创建、编辑、删除项目，并查看各项目下的归档条目。"
        />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="rounded-[24px] bg-surface/72 px-4 py-3">
            <p className="text-muted text-xs uppercase">项目数量</p>
            <p className="mt-2 text-2xl font-semibold">{projects.length}</p>
          </div>
          <button
            type="button"
            onClick={openCreateDialog}
            className="bg-primary hover:bg-primary/90 rounded-full px-4 py-2.5 text-sm font-medium text-white transition"
          >
            新建项目夹
          </button>
        </div>
        {projects.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((project) => {
              const count = items.filter((item) => item.projectId === project.id).length
              const active = currentProject?.id === project.id

              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() =>
                    void navigate({ to: "/project/$id", params: { id: project.id } })
                  }
                  className={cn(
                    "border-border/70 rounded-[26px] border p-5 text-left transition",
                    active
                      ? "border-primary bg-primary/10 shadow-[0_18px_36px_rgba(99,102,241,0.12)]"
                      : "bg-surface/76 hover:border-primary/40 hover:bg-primary/6",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span
                          className="size-4 rounded-full border border-white/70"
                          style={{ backgroundColor: project.color }}
                        />
                        <h3 className="truncate text-lg font-semibold">{project.name}</h3>
                      </div>
                      <p className="text-muted mt-3 line-clamp-3 text-sm leading-7">
                        {project.description || "暂未填写项目描述。"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        openEditDialog(project)
                      }}
                      className="border-border/60 text-muted hover:text-text rounded-full border px-3 py-1 text-xs font-medium transition"
                    >
                      编辑
                    </button>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted">
                    <FolderOpenDot className="size-3.5" />
                    <span>{count} 条已归档内容</span>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="rounded-[26px] border border-border/70 bg-surface/72 px-5 py-10 text-center">
            <p className="text-lg font-semibold">还没有项目夹</p>
            <p className="text-muted mt-2 text-sm">
              先创建一个项目夹，Inbox 里的拖拽归档和批量移入才能真正承接数据。
            </p>
          </div>
        )}
      </Surface>
      <Surface>
        <SectionTitle
          eyebrow="Project Detail"
          title={currentProject ? currentProject.name : "当前项目"}
          subtitle={
            currentProject
              ? "查看项目描述、归档数量，并把条目重新送回 Inbox。"
              : "没有可展示的项目时，这里会显示空状态。"
          }
        />
        {currentProject ? (
          <div className="grid gap-4">
            <div className="rounded-[24px] bg-surface/72 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <span
                      className="size-4 rounded-full border border-white/70"
                      style={{ backgroundColor: currentProject.color }}
                    />
                    <p className="text-xl font-semibold">{currentProject.name}</p>
                  </div>
                  <p className="text-muted mt-3 text-sm leading-7">
                    {currentProject.description || "暂未填写项目描述。"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEditDialog(currentProject)}
                    className="border-border/60 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:border-primary/40"
                  >
                    编辑项目
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] bg-surface/72 p-4">
              <p className="text-muted text-xs uppercase">已归档条目</p>
              <p className="mt-2 text-2xl font-semibold">{projectItems.length}</p>
            </div>

            {projectItems.length ? (
              <div className="grid gap-3">
                {projectItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[24px] border border-border/70 bg-surface/72 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm leading-7 font-medium">
                          {item.text}
                        </p>
                        <p className="text-muted mt-2 text-xs">
                          {item.source.title ?? item.source.appName ?? "来源未知"} ·{" "}
                          {formatItemTime(item.createdAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => moveBackMutation.mutate(item.id)}
                        disabled={moveBackMutation.isPending}
                        className="bg-primary/10 text-primary rounded-full px-3 py-1.5 text-xs font-medium transition hover:bg-primary/16 disabled:opacity-50"
                      >
                        移回 Inbox
                      </button>
                    </div>
                    {item.tags.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-bg/84 px-3 py-1 text-xs text-muted"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] border border-border/70 bg-surface/72 px-4 py-10 text-center">
                <p className="text-lg font-semibold">这个项目里还没有条目</p>
                <p className="text-muted mt-2 text-sm">
                  现在可以从 Inbox 拖进来，或用批量移入项目夹来归档。
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-[26px] border border-border/70 bg-surface/72 px-5 py-10 text-center">
            <p className="text-lg font-semibold">当前没有可展示的项目</p>
            <p className="text-muted mt-2 text-sm">
              创建项目夹后，这里会显示项目详情和归档条目。
            </p>
            <button
              type="button"
              onClick={openCreateDialog}
              className="bg-primary hover:bg-primary/90 mt-5 rounded-full px-4 py-2.5 text-sm font-medium text-white transition"
            >
              新建第一个项目夹
            </button>
          </div>
        )}
      </Surface>
      <ProjectDialog
        open={dialogMode !== null}
        mode={dialogMode ?? "create"}
        project={dialogMode === "edit" ? editingProject : null}
        pending={createMutation.isPending || updateMutation.isPending}
        deletePending={deleteMutation.isPending}
        errorMessage={dialogError}
        onClose={() => {
          setDialogMode(null)
          setEditingProject(null)
          setDialogError(undefined)
        }}
        onSubmit={(values) => {
          setDialogError(undefined)
          if (dialogMode === "edit" && editingProject) {
            updateMutation.mutate({ id: editingProject.id, values })
            return
          }
          createMutation.mutate(values)
        }}
        onDelete={
          dialogMode === "edit" && editingProject
            ? () => deleteMutation.mutate(editingProject.id)
            : undefined
        }
      />
    </div>
  )
}

function SettingsView() {
  return <SettingsForm />
}

function PluginsView() {
  const queryClient = useQueryClient()
  const pluginsQuery = useQuery({
    queryKey: ["plugins"],
    queryFn: tauriApi.listPlugins,
  })
  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await tauriApi.togglePlugin(id, enabled)
      invalidatePluginRuntimeCache(id)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["plugins"] })
      toast.success("插件状态已更新")
    },
    onError: () => {
      toast.error("插件状态更新失败")
    },
  })
  const plugins = pluginsQuery.data ?? []

  return (
    <div className="grid gap-6">
      <Surface>
        <SectionTitle
          eyebrow="Plugins"
          title="扩展能力看板"
          subtitle="这里不再是“插件管理页骨架”，而是一个更像产品后台的扩展入口。"
        />
        {plugins.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {plugins.map((plugin) => (
              <div
                key={plugin.id}
                className="border-border/70 rounded-[26px] border bg-surface/76 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <PlugZap className="text-primary size-4" />
                      <h3 className="text-lg font-semibold">{plugin.name}</h3>
                    </div>
                    <p className="text-muted mt-2 text-sm">v{plugin.version}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      toggleMutation.mutate({
                        id: plugin.id,
                        enabled: !plugin.enabled,
                      })
                    }
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition",
                      plugin.enabled
                        ? "bg-emerald-500/10 text-emerald-700"
                        : "bg-slate-500/10 text-slate-700",
                    )}
                  >
                    {plugin.enabled ? "已启用" : "已禁用"}
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {plugin.extensionPoints.length ? (
                    plugin.extensionPoints.map((point) => (
                      <span
                        key={point}
                        className="bg-primary/10 text-primary rounded-full px-3 py-1 text-xs"
                      >
                        {point}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted text-xs">暂无扩展点</span>
                  )}
                </div>
                {plugin.loadError ? (
                  <div className="mt-4 rounded-[18px] border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-xs text-amber-800 dark:text-amber-300">
                    {plugin.loadError}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="border-border/70 rounded-[26px] border bg-surface/72 px-5 py-10 text-center">
            <p className="text-lg font-semibold">当前没有插件</p>
            <p className="text-muted mt-2 text-sm">
              将插件放到配置目录后，这里会显示扫描结果。
            </p>
          </div>
        )}
      </Surface>
    </div>
  )
}

const rootRoute = createRootRoute({
  component: RootComponent,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <Navigate to="/inbox" />,
})

const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inbox",
  component: InboxView,
})

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/project/$id",
  component: ProjectView,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsView,
})

const pluginsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/plugins",
  component: PluginsView,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  inboxRoute,
  projectRoute,
  settingsRoute,
  pluginsRoute,
])

const router = createRouter({ routeTree, history: createHashHistory() })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

export function TaskManagerRouterProvider() {
  return <RouterProvider router={router} />
}
