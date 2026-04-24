import type { Item } from "@/types"

/**
 * Field weight descriptor for multi-field search.
 * weight > 0 means the field participates in matching.
 * Reserved for future ranked/weighted search (e.g. Fuse.js integration).
 */
export interface SearchField {
  /** Dot-path key used for display / identification */
  key: string
  /** Relative weight (reserved for future ranked search) */
  weight: number
  /** Extractor: given an Item, returns the string value(s) to match against */
  extract: (item: Item) => string | string[] | undefined | null
}

/**
 * Default field descriptors aligned with the backend `search_items` / `itemMatches` logic.
 * Property 7: text, source.url, source.title, source.appName, context.before, context.after, tags
 */
export const DEFAULT_SEARCH_FIELDS: SearchField[] = [
  { key: "text", weight: 10, extract: (item) => item.text },
  { key: "source.url", weight: 5, extract: (item) => item.source.url },
  { key: "source.title", weight: 5, extract: (item) => item.source.title },
  { key: "source.appName", weight: 3, extract: (item) => item.source.appName },
  { key: "context.before", weight: 2, extract: (item) => item.context.before },
  { key: "context.after", weight: 2, extract: (item) => item.context.after },
  { key: "tags", weight: 4, extract: (item) => item.tags },
]

/**
 * Returns true if `item` contains `query` in any of the provided fields
 * using case-insensitive substring matching.
 *
 * Matches the backend `itemMatches` behaviour in src/lib/mock/invoke.ts.
 *
 * @param item   - The item to test
 * @param query  - Raw search string (trimming and lowercasing applied internally)
 * @param fields - Field descriptors to search; defaults to DEFAULT_SEARCH_FIELDS
 */
export function itemMatchesQuery(
  item: Item,
  query: string,
  fields: SearchField[] = DEFAULT_SEARCH_FIELDS,
): boolean {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return true

  return fields.some((field) => {
    const value = field.extract(item)
    if (value == null) return false
    const values = Array.isArray(value) ? value : [value]
    return values.some((v) => String(v).toLowerCase().includes(keyword))
  })
}

/**
 * Filters an array of items by a search query across the given fields.
 * Empty / whitespace-only query returns all items unchanged.
 *
 * @param items  - Source array
 * @param query  - Search string
 * @param fields - Field descriptors; defaults to DEFAULT_SEARCH_FIELDS
 */
export function filterItems(
  items: Item[],
  query: string,
  fields: SearchField[] = DEFAULT_SEARCH_FIELDS,
): Item[] {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return items
  return items.filter((item) => itemMatchesQuery(item, keyword, fields))
}
