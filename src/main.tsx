import { StrictMode, useEffect } from "react"
import { createRoot } from "react-dom/client"
import { Toaster } from "sonner"
import { listen, tauriApi } from "@/lib/tauri"
import { runPostSavePlugins } from "@/lib/plugins"
import { applyTheme } from "@/lib/theme/apply-theme"
import type { Item } from "@/types"
import { toast } from "sonner"
import "@/styles/globals.css"

function AppEventBridge() {
  useEffect(() => {
    const cleanups: Array<() => void> = []

    void listen<{ status: "saved"; itemId: string; message: string }>(
      "quick-save-result",
      (payload) => {
        toast.success(payload.message, {
          description: `条目 ${payload.itemId.slice(0, 8)} 已写入 Inbox。`,
          duration: 2000,
        })
      },
    ).then((unlisten) => {
      cleanups.push(unlisten)
    })

    void listen<Item>("item-saved", (item) => {
      void runPostSavePlugins(item)
    }).then((unlisten) => {
      cleanups.push(unlisten)
    })

    void listen<{ itemId: string }>("reminder-triggered", async (payload) => {
      const text = `提醒条目 ${payload.itemId.slice(0, 8)} 已到时间`
      try {
        const plugin = await import("@tauri-apps/plugin-notification")
        let permissionGranted = await plugin.isPermissionGranted()
        if (!permissionGranted) {
          permissionGranted = (await plugin.requestPermission()) === "granted"
        }
        if (permissionGranted) {
          plugin.sendNotification({
            title: "TextClip 提醒",
            body: text,
            extra: { itemId: payload.itemId },
          })
        }
      } catch (error) {
        console.error("[notification]", error)
      }

      toast.message("提醒已触发", {
        description: text,
        action: {
          label: "打开条目",
          onClick: () => void tauriApi.showTaskManagerWindow(payload.itemId),
        },
      })
    }).then((unlisten) => {
      cleanups.push(unlisten)
    })

    void import("@tauri-apps/plugin-notification")
      .then(async (plugin) => {
        const unlisten = await plugin.onAction((notification) => {
          const extra = notification.extra as { itemId?: string } | undefined
          if (extra?.itemId) {
            void tauriApi.showTaskManagerWindow(extra.itemId)
          }
        })
        cleanups.push(() => {
          void unlisten.unregister()
        })
      })
      .catch((error) => {
        console.error("[notification-action]", error)
      })

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [])

  return null
}

async function bootstrap() {
  const rootElement = document.getElementById("root")
  if (!rootElement) {
    throw new Error("Root element not found")
  }

  const settings = await tauriApi.getSettings()
  applyTheme(settings)

  const windowType = window.location.hash.replace("#", "") || "manager"

  const windowMap = {
    manager: () => import("@/windows/TaskManagerWindow"),
    overlay: () => import("@/windows/OverlayWindow"),
    "screenshot-ocr": () => import("@/windows/ScreenshotOcrWindow"),
    spotlight: () => import("@/windows/SearchSpotlight"),
    sticky: () => import("@/windows/DesktopSticky"),
  }

  const loadWindow =
    windowMap[windowType as keyof typeof windowMap] ?? windowMap.manager
  const { default: WindowComponent } = await loadWindow()

  createRoot(rootElement).render(
    <StrictMode>
      <>
        <WindowComponent />
        <AppEventBridge />
        <Toaster
          richColors
          position="top-right"
          toastOptions={{
            className: "font-medium",
          }}
        />
      </>
    </StrictMode>,
  )
}

void bootstrap()
