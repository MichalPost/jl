import { Search, X } from "lucide-react"
import { useDebounceValue } from "usehooks-ts"
import { useEffect, useState } from "react"
import { cn } from "@/utils/cn"

interface SearchBarProps {
  /** Called with the debounced value after 300ms of inactivity */
  onSearch: (query: string) => void
  placeholder?: string
  className?: string
}

/**
 * SearchBar with 300ms debounce.
 * Requirement 6.1: placeholder "搜索任务..."
 * Requirement 6.2: triggers filter 300ms after input stops
 * Requirement 6.4: clearing restores full results
 */
export function SearchBar({
  onSearch,
  placeholder = "搜索任务...",
  className,
}: SearchBarProps) {
  const [value, setValue] = useState("")
  const [debouncedValue] = useDebounceValue(value, 300)

  useEffect(() => {
    onSearch(debouncedValue)
  }, [debouncedValue, onSearch])

  function handleClear() {
    setValue("")
    // debouncedValue will update to "" via the effect above
  }

  return (
    <div
      className={cn(
        "border-border/70 bg-surface/80 flex items-center gap-3 rounded-[24px] border px-4 py-3",
        className,
      )}
    >
      <Search className="text-muted size-4 shrink-0" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="text-text placeholder:text-muted min-w-0 flex-1 bg-transparent outline-none"
        aria-label={placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="清空搜索"
          className="text-muted hover:text-text shrink-0 transition"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
