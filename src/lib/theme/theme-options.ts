export const THEME_OPTIONS = [
  { id: "snow", label: "雪白", swatch: "bg-indigo-500" },
  { id: "midnight", label: "夜幕", swatch: "bg-slate-900" },
  { id: "forest", label: "森林", swatch: "bg-emerald-500" },
  { id: "ocean", label: "海洋", swatch: "bg-sky-500" },
  { id: "rose", label: "玫瑰", swatch: "bg-rose-500" },
  { id: "amber", label: "琥珀", swatch: "bg-amber-500" },
  { id: "slate", label: "岩板", swatch: "bg-slate-500" },
  { id: "custom", label: "自定义", swatch: "bg-[linear-gradient(135deg,#2563eb,#14b8a6,#f59e0b)]" },
] as const

export const THEME_LABELS = Object.fromEntries(
  THEME_OPTIONS.map((theme) => [theme.id, theme.label]),
) as Record<string, string>
