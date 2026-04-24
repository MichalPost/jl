import { Link, useLocation } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Check,
  FolderKanban,
  Inbox,
  ChevronDown,
  MoonStar,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from "lucide-react"
import { type PropsWithChildren, useEffect, useRef, useState } from "react"
import { tauriApi } from "@/lib/tauri"
import { applyTheme } from "@/lib/theme/apply-theme"
import { THEME_OPTIONS } from "@/lib/theme/theme-options"
import { TaskManagerRouterProvider } from "@/lib/router/task-manager-router"
import { useThemeStore } from "@/stores/theme-store"
import { cn } from "@/utils/cn"

const EMPTY_PROJECT_ROUTE_ID = "__empty__"

export function TaskManagerLayout({ children }: PropsWithChildren) {
  const queryClient = useQueryClient()
  const { setSettings } = useThemeStore()
  const location = useLocation()
  const navRef = useRef<HTMLElement | null>(null)
  const navScrollLeftRef = useRef(0)
  const themeMenuRef = useRef<HTMLDetailsElement | null>(null)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: tauriApi.getSettings,
  })
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: tauriApi.listProjects,
  })

  const themeMutation = useMutation({
    mutationFn: async (theme: string) => {
      await tauriApi.saveSettings({ theme, followSystemTheme: false })
      const nextSettings = await tauriApi.getSettings()
      applyTheme(nextSettings)
      setSettings(nextSettings)
      return nextSettings
    },
    onSuccess: (nextSettings) => {
      void queryClient.setQueryData(["settings"], nextSettings)
    },
  })

  const activeTheme = settingsQuery.data?.theme ?? "snow"
  const projectTarget = projectsQuery.data?.[0]?.id
    ? `/project/${projectsQuery.data[0].id}`
    : `/project/${EMPTY_PROJECT_ROUTE_ID}`
  const navItems = [
    { to: "/inbox", label: "Inbox", icon: Inbox },
    { to: projectTarget, label: "项目夹", icon: FolderKanban },
    { to: "/settings", label: "设置", icon: Palette },
    { to: "/plugins", label: "插件", icon: Sparkles },
  ]

  useEffect(() => {
    const nav = navRef.current
    if (!nav) {
      return
    }

    nav.scrollLeft = navScrollLeftRef.current
  }, [location.href])

  useEffect(() => {
    if (!themeMenuOpen) {
      return undefined
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!themeMenuRef.current?.contains(event.target as Node)) {
        setThemeMenuOpen(false)
      }
    }

    window.addEventListener("mousedown", handlePointerDown)
    return () => window.removeEventListener("mousedown", handlePointerDown)
  }, [themeMenuOpen])

  function rememberNavScroll() {
    const nav = navRef.current
    if (!nav) {
      return
    }

    navScrollLeftRef.current = nav.scrollLeft
  }

  return (
    <div className="text-text min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.10),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.10),_transparent_28%),linear-gradient(180deg,_oklch(99.5%_0.004_270)_0%,_oklch(96.5%_0.012_270)_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.18),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(15,23,42,0.18),_transparent_34%),linear-gradient(180deg,_oklch(18%_0.025_252)_0%,_oklch(12.5%_0.018_250)_100%)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.12)_18%,transparent_36%),linear-gradient(transparent_0%,rgba(148,163,184,0.05)_100%)] dark:bg-[linear-gradient(140deg,transparent_0%,rgba(148,163,184,0.05)_20%,transparent_42%),linear-gradient(180deg,rgba(148,163,184,0.03)_0%,rgba(15,23,42,0.26)_100%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <header className="border-border/70 bg-surface/72 rounded-[24px] border px-4 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.10)] backdrop-blur-[--blur-glass] sm:px-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold sm:text-xl">工作台</h1>
            </div>
            <details
              ref={themeMenuRef}
              open={themeMenuOpen}
              onToggle={(event) =>
                setThemeMenuOpen((event.currentTarget as HTMLDetailsElement).open)
              }
              className="relative shrink-0"
            >
              <summary
                className="border-border/70 bg-bg/84 marker:hidden flex cursor-pointer list-none items-center gap-3 rounded-[16px] border px-3.5 py-2 shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
              >
                <span className="bg-primary/10 text-primary rounded-2xl p-2">
                  <MoonStar className="size-4" />
                </span>
                <div className="text-left">
                  <p className="text-muted text-[11px] tracking-[0.24em] uppercase">
                    主题
                  </p>
                  <p className="text-sm font-medium">
                    {THEME_OPTIONS.find((theme) => theme.id === activeTheme)?.label ?? "未知主题"}
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    "text-muted size-4 transition",
                    themeMenuOpen && "rotate-180",
                  )}
                />
              </summary>
              <div className="border-border/70 bg-bg absolute top-[calc(100%+0.75rem)] right-0 z-20 w-[260px] rounded-[24px] border p-3 shadow-[0_20px_60px_rgba(15,23,42,0.16)] backdrop-blur-[--blur-glass]">
                <p className="text-muted px-2 pb-2 text-[11px] tracking-[0.24em] uppercase">
                  主题切换
                </p>
                <div className="grid gap-2">
                  {THEME_OPTIONS.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => {
                        themeMutation.mutate(theme.id)
                        setThemeMenuOpen(false)
                      }}
                      className={cn(
                        "border-border/70 hover:border-primary/50 hover:bg-primary/8 flex items-center justify-between rounded-2xl border px-3 py-2.5 text-left text-sm transition",
                        activeTheme === theme.id &&
                          "border-primary bg-primary/10 text-primary",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className={cn("size-3 rounded-full", theme.swatch)} />
                        <span>{theme.label}</span>
                      </span>
                      {activeTheme === theme.id ? (
                        <Check className="size-4" />
                      ) : null}
                    </button>
                  ))}
                </div>
                <p className="text-muted px-2 pt-3 text-xs">
                  已选：
                  <span className="text-text font-medium">
                    {THEME_OPTIONS.find((theme) => theme.id === activeTheme)?.label ?? "未知主题"}
                  </span>
                  {themeMutation.isPending ? "，正在切换..." : ""}
                </p>
              </div>
            </details>
          </div>
        </header>

        <div
          className={cn(
            "grid min-h-0 flex-1 grid-cols-1 gap-5",
            sidebarCollapsed
              ? "lg:grid-cols-[76px_minmax(0,1fr)]"
              : "lg:grid-cols-[240px_minmax(0,1fr)]",
          )}
        >
          <aside
            className={cn(
              "border-border/70 bg-surface/78 rounded-[26px] border p-4 shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur-[--blur-glass]",
              sidebarCollapsed && "flex flex-col items-center px-2.5 py-3",
            )}
          >
            <div
              className={cn(
                "mb-4 flex items-center justify-between lg:mb-4",
                sidebarCollapsed && "mb-3 w-full justify-center",
              )}
            >
              <div className={cn(sidebarCollapsed && "hidden")}>
                <p className="text-muted text-xs tracking-[0.28em] uppercase">
                  Navigator
                </p>
                <h2 className="mt-1.5 text-xl font-semibold">工作区导航</h2>
              </div>
              <button
                type="button"
                onClick={() => setSidebarCollapsed((value) => !value)}
                className={cn(
                  "border-border/60 text-muted hover:text-text hover:border-primary/40 hover:bg-primary/8 inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border transition",
                  sidebarCollapsed && "size-9 rounded-xl",
                )}
                aria-label={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
                title={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="size-5" />
                ) : (
                  <PanelLeftClose className="size-5" />
                )}
              </button>
            </div>
            <nav
              ref={navRef}
              onScroll={rememberNavScroll}
              className={cn(
                "-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:overflow-visible lg:px-0",
                sidebarCollapsed
                  ? "lg:mx-0 lg:flex lg:w-full lg:flex-col lg:items-center lg:gap-2 lg:px-0"
                  : "lg:grid",
              )}
            >
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    resetScroll={false}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      rememberNavScroll()
                    }}
                    onClick={() => {
                      rememberNavScroll()
                    }}
                    className={cn(
                      "text-muted hover:bg-primary/10 hover:text-text flex shrink-0 items-center gap-3 rounded-[22px] px-4 py-3 text-sm transition lg:shrink",
                      sidebarCollapsed &&
                        "lg:size-11 lg:justify-center lg:gap-0 lg:rounded-[18px] lg:px-0 lg:py-0",
                      "[&.active]:bg-primary [&.active]:text-white [&.active]:shadow-lg",
                    )}
                    aria-label={item.label}
                    title={item.label}
                  >
                    <Icon className="size-4" />
                    <span className={cn(sidebarCollapsed && "lg:hidden")}>
                      {item.label}
                    </span>
                  </Link>
                )
              })}
            </nav>
          </aside>

          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  )
}

export default function TaskManagerWindow() {
  return <TaskManagerRouterProvider />
}
