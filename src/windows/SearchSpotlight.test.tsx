import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import SearchSpotlight from "@/windows/SearchSpotlight"

const searchItems = vi.fn()
const listItems = vi.fn()
const showTaskManagerWindow = vi.fn()
const hideSpotlight = vi.fn()
const searchPluginSpotlight = vi.fn()
const runPluginSpotlightSelection = vi.fn()

vi.mock("@/lib/tauri", () => ({
  tauriApi: {
    searchItems: (...args: unknown[]) => searchItems(...args),
    listItems: (...args: unknown[]) => listItems(...args),
    showTaskManagerWindow: (...args: unknown[]) => showTaskManagerWindow(...args),
    hideSpotlight: (...args: unknown[]) => hideSpotlight(...args),
  },
}))

vi.mock("@/lib/plugins", () => ({
  searchPluginSpotlight: (...args: unknown[]) => searchPluginSpotlight(...args),
  runPluginSpotlightSelection: (...args: unknown[]) => runPluginSpotlightSelection(...args),
}))

describe("SearchSpotlight", () => {
  beforeEach(() => {
    searchItems.mockResolvedValue([
      {
        id: "item-1",
        type: "todo",
        text: "整理 OCR provider",
        source: { type: "browser", title: "Design Doc" },
        context: { before: "", after: "" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        completed: false,
        inbox: true,
        tags: ["ocr"],
      },
    ])
    listItems.mockResolvedValue([])
    searchPluginSpotlight.mockResolvedValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("debounces query by 200ms and searches local results", async () => {
    render(<SearchSpotlight />)

    fireEvent.change(screen.getByPlaceholderText(/搜索 text/i), {
      target: { value: "ocr" },
    })

    expect(searchItems).not.toHaveBeenCalled()
    await new Promise((resolve) => setTimeout(resolve, 199))
    expect(searchItems).not.toHaveBeenCalled()

    await new Promise((resolve) => setTimeout(resolve, 20))
    await waitFor(() => expect(searchItems).toHaveBeenCalledWith("ocr"))
  }, 10000)

  it("supports keyboard navigation and enter to open local item", async () => {
    render(<SearchSpotlight />)

    const input = screen.getByPlaceholderText(/搜索 text/i)
    fireEvent.change(input, { target: { value: "ocr" } })
    await new Promise((resolve) => setTimeout(resolve, 240))

    await waitFor(() => screen.getByText("整理 OCR provider"))
    fireEvent.keyDown(input, { key: "ArrowDown" })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() =>
      expect(showTaskManagerWindow).toHaveBeenCalledWith("item-1"),
    )
    expect(hideSpotlight).toHaveBeenCalled()
  }, 10000)

  it("closes on escape", async () => {
    render(<SearchSpotlight />)

    fireEvent.keyDown(screen.getByPlaceholderText(/搜索 text/i), {
      key: "Escape",
    })

    expect(hideSpotlight).toHaveBeenCalled()
  })
})
