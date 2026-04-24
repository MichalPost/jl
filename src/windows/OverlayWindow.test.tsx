import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import OverlayWindow from "@/windows/OverlayWindow"

const saveItem = vi.fn()
const createSticky = vi.fn()
const showOverlayWindow = vi.fn()
const hideOverlayWindow = vi.fn()
const rememberSelection = vi.fn()

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("@/lib/tauri", () => ({
  isTauriEnvironment: () => false,
  listen: async () => () => undefined,
  tauriApi: {
    saveItem: (...args: unknown[]) => saveItem(...args),
    createSticky: (...args: unknown[]) => createSticky(...args),
    rememberSelection: (...args: unknown[]) => rememberSelection(...args),
    showOverlayWindow: (...args: unknown[]) => showOverlayWindow(...args),
    hideOverlayWindow: (...args: unknown[]) => hideOverlayWindow(...args),
    showTaskManagerWindow: vi.fn(),
  },
}))

vi.mock("@/lib/plugins", () => ({
  getPopupPluginActions: vi.fn().mockResolvedValue([]),
}))

describe("OverlayWindow", () => {
  beforeEach(() => {
    saveItem.mockResolvedValue(undefined)
    createSticky.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("saves as todo from popup action", async () => {
    render(<OverlayWindow />)
    window.dispatchEvent(
      new CustomEvent("textclip:frontend-ocr-selection", {
        detail: {
          text: "测试划词内容",
          x: 120,
          y: 120,
          source: { type: "browser", title: "Example" },
          context: { before: "before", after: "after" },
        },
      }),
    )

    fireEvent.click(await screen.findByRole("button", { name: /加入 TODO/i }))

    await waitFor(() => expect(saveItem).toHaveBeenCalledTimes(1))
    expect(saveItem.mock.calls[0][0]).toMatchObject({
      type: "todo",
      text: "测试划词内容",
    })
  })

  it("creates sticky note from popup action", async () => {
    render(<OverlayWindow />)
    window.dispatchEvent(
      new CustomEvent("textclip:frontend-ocr-selection", {
        detail: {
          text: "测试划词内容",
          x: 120,
          y: 120,
          source: { type: "browser", title: "Example" },
          context: { before: "before", after: "after" },
        },
      }),
    )

    fireEvent.click(await screen.findByRole("button", { name: /钉在桌面/i }))

    await waitFor(() => expect(createSticky).toHaveBeenCalledWith("测试划词内容"))
  })

  it("closes on escape", async () => {
    render(<OverlayWindow />)

    fireEvent.keyDown(window, { key: "Escape" })

    expect(screen.queryByText("一键把灵感收束")).not.toBeInTheDocument()
  })
})
