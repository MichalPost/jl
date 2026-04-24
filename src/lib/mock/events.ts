type Handler<T> = (payload: T) => void

const handlers = new Map<string, Set<Handler<unknown>>>()

export type UnlistenFn = () => void

export function mockListen<T>(
  event: string,
  handler: Handler<T>,
): Promise<UnlistenFn> {
  if (!handlers.has(event)) {
    handlers.set(event, new Set())
  }

  handlers.get(event)!.add(handler as Handler<unknown>)

  return Promise.resolve(() => {
    handlers.get(event)?.delete(handler as Handler<unknown>)
  })
}

export function emitMockEvent<T>(event: string, payload: T) {
  handlers.get(event)?.forEach((handler) => handler(payload))
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "t") {
      emitMockEvent("text-selected", {
        text: "响应式策略要从一开始考虑，而不是等桌面 UI 做完后再补救。",
        x: Math.max(window.innerWidth * 0.35, 180),
        y: Math.max(window.innerHeight * 0.3, 120),
        source: {
          type: "browser",
          title: "Tailwind Responsive Design",
          url: "https://tailwindcss.com/docs/responsive-design",
        },
        context: {
          before: "Tailwind 推荐采用 mobile-first 的断点策略。",
          after: "这样浏览器开发模式和桌面窗口缩放都能共享一套布局逻辑。",
        },
      })
    }
  })
}
