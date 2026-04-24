/**
 * Tests for src/utils/search.ts
 * Validates: Requirements 6.5; Design Property 7 (搜索结果一致性)
 */
import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { filterItems, itemMatchesQuery, DEFAULT_SEARCH_FIELDS } from "./search"
import type { Item } from "@/types"

// ── helpers ──────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "test-id",
    type: "todo",
    text: "Hello World",
    source: { type: "unknown" },
    context: { before: "", after: "" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completed: false,
    inbox: true,
    tags: [],
    ...overrides,
  }
}

// ── unit tests ────────────────────────────────────────────────────────────────

describe("itemMatchesQuery", () => {
  it("returns true for empty query", () => {
    expect(itemMatchesQuery(makeItem(), "")).toBe(true)
    expect(itemMatchesQuery(makeItem(), "   ")).toBe(true)
  })

  it("matches text field case-insensitively", () => {
    const item = makeItem({ text: "Hello World" })
    expect(itemMatchesQuery(item, "hello")).toBe(true)
    expect(itemMatchesQuery(item, "WORLD")).toBe(true)
    expect(itemMatchesQuery(item, "HeLLo WoRLd")).toBe(true)
  })

  it("returns false when text does not match", () => {
    const item = makeItem({ text: "Hello World" })
    expect(itemMatchesQuery(item, "xyz")).toBe(false)
  })

  it("matches source.title case-insensitively", () => {
    const item = makeItem({ source: { type: "browser", title: "GitHub Docs" } })
    expect(itemMatchesQuery(item, "github")).toBe(true)
    expect(itemMatchesQuery(item, "DOCS")).toBe(true)
  })

  it("matches source.url", () => {
    const item = makeItem({ source: { type: "browser", url: "https://example.com/path" } })
    expect(itemMatchesQuery(item, "example")).toBe(true)
  })

  it("matches source.appName", () => {
    const item = makeItem({ source: { type: "app", appName: "Visual Studio Code" } })
    expect(itemMatchesQuery(item, "visual studio")).toBe(true)
  })

  it("matches context.before", () => {
    const item = makeItem({ context: { before: "Some context before.", after: "" } })
    expect(itemMatchesQuery(item, "context before")).toBe(true)
  })

  it("matches context.after", () => {
    const item = makeItem({ context: { before: "", after: "Some context after." } })
    expect(itemMatchesQuery(item, "context after")).toBe(true)
  })

  it("matches tags", () => {
    const item = makeItem({ tags: ["react", "typescript"] })
    expect(itemMatchesQuery(item, "react")).toBe(true)
    expect(itemMatchesQuery(item, "TYPESCRIPT")).toBe(true)
  })

  it("returns false when no field matches", () => {
    const item = makeItem({
      text: "Hello",
      source: { type: "unknown" },
      context: { before: "", after: "" },
      tags: [],
    })
    expect(itemMatchesQuery(item, "zzznomatch")).toBe(false)
  })
})

describe("filterItems", () => {
  it("returns all items for empty query", () => {
    const items = [makeItem({ id: "1" }), makeItem({ id: "2" })]
    expect(filterItems(items, "")).toHaveLength(2)
    expect(filterItems(items, "   ")).toHaveLength(2)
  })

  it("filters by text case-insensitively", () => {
    const items = [
      makeItem({ id: "1", text: "Buy groceries" }),
      makeItem({ id: "2", text: "Read a book" }),
    ]
    expect(filterItems(items, "groceries")).toHaveLength(1)
    expect(filterItems(items, "GROCERIES")).toHaveLength(1)
    expect(filterItems(items, "read")).toHaveLength(1)
  })

  it("returns empty array when nothing matches", () => {
    const items = [makeItem({ id: "1", text: "Hello" })]
    expect(filterItems(items, "zzznomatch")).toHaveLength(0)
  })

  it("returns all matching items without omission", () => {
    const items = [
      makeItem({ id: "1", text: "TypeScript tips" }),
      makeItem({ id: "2", text: "typescript best practices" }),
      makeItem({ id: "3", text: "JavaScript guide" }),
    ]
    const result = filterItems(items, "typescript")
    expect(result).toHaveLength(2)
    expect(result.map((i) => i.id)).toContain("1")
    expect(result.map((i) => i.id)).toContain("2")
  })
})

// ── property-based tests ──────────────────────────────────────────────────────

/**
 * Property 7: 搜索结果一致性
 * Validates: Requirements 6.2, 6.5; Design Property 7
 *
 * For any item collection and non-empty query:
 * 1. Every result contains the keyword in at least one field (no false positives)
 * 2. Every item that contains the keyword appears in results (no false negatives)
 */
describe("Property 7: search consistency (fast-check)", () => {
  // Arbitrary for a minimal Item
  const arbItem = fc.record({
    id: fc.uuid(),
    type: fc.constant("todo" as const),
    text: fc.string({ minLength: 0, maxLength: 100 }),
    source: fc.record({
      type: fc.constant("unknown" as const),
      url: fc.option(fc.webUrl(), { nil: undefined }),
      title: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
      appName: fc.option(fc.string({ maxLength: 30 }), { nil: undefined }),
    }),
    context: fc.record({
      before: fc.string({ maxLength: 80 }),
      after: fc.string({ maxLength: 80 }),
    }),
    createdAt: fc.constant(new Date().toISOString()),
    updatedAt: fc.constant(new Date().toISOString()),
    completed: fc.boolean(),
    inbox: fc.boolean(),
    tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
  })

  it("no false positives: every result matches the query", () => {
    fc.assert(
      fc.property(
        fc.array(arbItem, { maxLength: 30 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (items, query) => {
          const results = filterItems(items, query)
          return results.every((r) => itemMatchesQuery(r, query, DEFAULT_SEARCH_FIELDS))
        },
      ),
      { numRuns: 100 },
    )
  })

  it("no false negatives: every matching item appears in results", () => {
    fc.assert(
      fc.property(
        fc.array(arbItem, { maxLength: 30 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (items, query) => {
          const results = filterItems(items, query)
          const resultIds = new Set(results.map((r) => r.id))
          return items
            .filter((item) => itemMatchesQuery(item, query, DEFAULT_SEARCH_FIELDS))
            .every((item) => resultIds.has(item.id))
        },
      ),
      { numRuns: 100 },
    )
  })

  it("empty query returns all items", () => {
    fc.assert(
      fc.property(fc.array(arbItem, { maxLength: 30 }), (items) => {
        return filterItems(items, "").length === items.length
      }),
      { numRuns: 100 },
    )
  })

  it("whitespace-only query returns all items", () => {
    fc.assert(
      fc.property(
        fc.array(arbItem, { maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 10 }).map((s) => s.replace(/\S/g, " ")),
        (items, spaces) => {
          return filterItems(items, spaces).length === items.length
        },
      ),
      { numRuns: 100 },
    )
  })
})
