import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { LoaderCircle, Trash2, X } from "lucide-react"
import { z } from "zod"
import { normalizeHexColor } from "@/lib/theme/apply-theme"
import type { CreateProjectPayload, Project } from "@/types"
import { cn } from "@/utils/cn"

const PROJECT_COLOR_PRESETS = [
  "#2563eb",
  "#0f766e",
  "#dc2626",
  "#7c3aed",
  "#f59e0b",
  "#0f172a",
]

const projectFormSchema = z.object({
  name: z.string().trim().min(1, "请输入项目名称"),
  color: z
    .string()
    .trim()
    .transform((value) => normalizeHexColor(value) ?? "")
    .refine((value) => /^#[0-9a-f]{6}$/i.test(value), "请输入合法的颜色值"),
  description: z.string().optional(),
})

type ProjectFormValues = z.output<typeof projectFormSchema>

interface ProjectDialogProps {
  open: boolean
  mode: "create" | "edit"
  project?: Project | null
  pending?: boolean
  deletePending?: boolean
  errorMessage?: string
  onClose: () => void
  onSubmit: (values: CreateProjectPayload) => void
  onDelete?: () => void
}

function toDefaultValues(project?: Project | null): ProjectFormValues {
  return {
    name: project?.name ?? "",
    color: project?.color ?? "#2563eb",
    description: project?.description ?? "",
  }
}

export function ProjectDialog({
  open,
  mode,
  project,
  pending,
  deletePending,
  errorMessage,
  onClose,
  onSubmit,
  onDelete,
}: ProjectDialogProps) {
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: toDefaultValues(project),
  })

  useEffect(() => {
    form.reset(toDefaultValues(project))
  }, [form, project, open])

  if (!open) {
    return null
  }

  const values = form.watch()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="border-border/70 bg-bg/96 w-full max-w-xl rounded-[30px] border p-5 shadow-[0_30px_80px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-muted text-xs tracking-[0.24em] uppercase">
              {mode === "create" ? "Create Project" : "Edit Project"}
            </p>
            <h2 className="mt-2 font-serif text-3xl font-semibold">
              {mode === "create" ? "新建项目夹" : "编辑项目夹"}
            </h2>
            <p className="text-muted mt-2 text-sm leading-6">
              项目夹用于承接 Inbox 归档内容，编辑统一在弹窗内完成。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border-border/60 text-muted hover:text-text rounded-full border p-2 transition"
            aria-label="关闭项目弹窗"
          >
            <X className="size-4" />
          </button>
        </div>

        <form
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) =>
            onSubmit({
              name: values.name.trim(),
              color: values.color,
              description: values.description?.trim() || undefined,
            }),
          )}
        >
          <label className="grid gap-2">
            <span className="text-muted text-xs tracking-[0.2em] uppercase">项目名称</span>
            <input
              {...form.register("name")}
              className="border-border/70 bg-surface/82 rounded-[18px] border px-4 py-3 text-sm outline-none"
              placeholder="例如：研究摘录"
            />
            {form.formState.errors.name ? (
              <span className="text-sm text-rose-600">
                {form.formState.errors.name.message}
              </span>
            ) : null}
          </label>

          <div className="grid gap-4 md:grid-cols-[0.85fr_1.15fr]">
            <label className="grid gap-2">
              <span className="text-muted text-xs tracking-[0.2em] uppercase">项目颜色</span>
              <input
                {...form.register("color")}
                className="border-border/70 bg-surface/82 rounded-[18px] border px-4 py-3 text-sm outline-none"
                placeholder="#2563eb"
              />
              {form.formState.errors.color ? (
                <span className="text-sm text-rose-600">
                  {form.formState.errors.color.message}
                </span>
              ) : null}
            </label>
            <div className="grid gap-2">
              <span className="text-muted text-xs tracking-[0.2em] uppercase">预设颜色</span>
              <div className="flex flex-wrap gap-2 rounded-[18px] border border-border/60 bg-surface/70 p-3">
                {PROJECT_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => form.setValue("color", preset, { shouldDirty: true })}
                    className={cn(
                      "size-8 rounded-full border-2 transition",
                      values.color === preset ? "border-slate-950 dark:border-white" : "border-white/70",
                    )}
                    style={{ backgroundColor: preset }}
                    aria-label={`选择颜色 ${preset}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <label className="grid gap-2">
            <span className="text-muted text-xs tracking-[0.2em] uppercase">项目描述</span>
            <textarea
              {...form.register("description")}
              rows={4}
              className="border-border/70 bg-surface/82 resize-none rounded-[18px] border px-4 py-3 text-sm outline-none"
              placeholder="简单写一下这个项目夹主要收纳什么内容"
            />
          </label>

          {errorMessage ? (
            <div className="rounded-[18px] border border-rose-300/60 bg-rose-50/85 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div>
              {mode === "edit" && onDelete ? (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={pending || deletePending}
                  className="inline-flex items-center gap-2 rounded-full bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-500/20 disabled:opacity-50"
                >
                  {deletePending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  删除项目
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="border-border/60 text-muted hover:text-text rounded-full border px-4 py-2.5 text-sm font-medium transition"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={pending}
                className="bg-primary hover:bg-primary/90 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-50"
              >
                {pending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                {mode === "create" ? "创建项目" : "保存修改"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
