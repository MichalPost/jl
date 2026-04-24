import { act, fireEvent, render, screen } from "@testing-library/react"
import { SearchBar } from "@/components/shared/SearchBar"

describe("SearchBar", () => {
  it("debounces search by 300ms", async () => {
    vi.useFakeTimers()
    const onSearch = vi.fn()

    render(<SearchBar onSearch={onSearch} />)

    onSearch.mockClear()
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "hello" } })

    expect(onSearch).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(299)
    })
    expect(onSearch).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(onSearch).toHaveBeenCalledWith("hello")
    vi.useRealTimers()
  })

  it("clears search back to empty string", async () => {
    vi.useFakeTimers()
    const onSearch = vi.fn()

    render(<SearchBar onSearch={onSearch} />)
    const input = screen.getByRole("searchbox")

    fireEvent.change(input, { target: { value: "abc" } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(onSearch).toHaveBeenLastCalledWith("abc")

    fireEvent.click(screen.getByRole("button", { name: "清空搜索" }))
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(onSearch).toHaveBeenLastCalledWith("")
    vi.useRealTimers()
  })
})
