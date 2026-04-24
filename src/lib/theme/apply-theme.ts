import chroma from "chroma-js"
import type { AppSettings } from "@/types"

let systemThemeCleanup: (() => void) | undefined

function clearCustomPrimary() {
  const root = document.documentElement
  root.style.removeProperty("--app-primary")
  root.style.removeProperty("--app-primary-hover")
  root.style.removeProperty("--app-border")
}

export function normalizeHexColor(value?: string | null) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return undefined
  }

  let normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`
  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    normalized = `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
  }

  return normalized
}

export function isReadableColor(hex: string) {
  const color = chroma(hex)
  const whiteContrast = chroma.contrast(color, "#ffffff")
  const blackContrast = chroma.contrast(color, "#0f172a")
  return Math.max(whiteContrast, blackContrast) >= 4.5
}

export function applyCustomPrimary(hex: string) {
  const root = document.documentElement
  const [l, c, h] = chroma(hex).oklch()

  root.style.setProperty(
    "--app-primary",
    `oklch(${(l * 100).toFixed(1)}% ${c.toFixed(3)} ${h.toFixed(1)})`,
  )
  root.style.setProperty(
    "--app-primary-hover",
    `oklch(${((l - 0.07) * 100).toFixed(1)}% ${c.toFixed(3)} ${h.toFixed(1)})`,
  )
  root.style.setProperty(
    "--app-border",
    `oklch(${(l * 100).toFixed(1)}% ${c.toFixed(3)} ${h.toFixed(1)} / 14%)`,
  )
}

export function applyTheme(settings: AppSettings) {
  const root = document.documentElement
  systemThemeCleanup?.()
  systemThemeCleanup = undefined

  if (settings.followSystemTheme) {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const syncTheme = () =>
      root.setAttribute("data-theme", mediaQuery.matches ? "midnight" : "snow")
    syncTheme()
    mediaQuery.addEventListener("change", syncTheme)
    systemThemeCleanup = () => mediaQuery.removeEventListener("change", syncTheme)
  } else {
    root.setAttribute("data-theme", settings.theme || "snow")
  }

  const customPrimaryColor = normalizeHexColor(settings.customPrimaryColor)
  if (settings.theme === "custom" && customPrimaryColor) {
    applyCustomPrimary(customPrimaryColor)
  } else {
    clearCustomPrimary()
  }

  localStorage.setItem("app-settings", JSON.stringify(settings))
}
