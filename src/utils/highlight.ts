/**
 * Splits `text` into segments, marking which parts match `query`.
 *
 * - Empty / whitespace-only query → returns the whole text as a single unmatched segment.
 * - Special regex characters in `query` are escaped so they are treated as literals.
 * - Matching is case-insensitive.
 *
 * Requirement 6.3 / 6.4: stable behaviour for empty, whitespace-only and
 * special-character queries.
 */
export function highlightMatch(
  text: string,
  query: string,
): Array<{ text: string; matched: boolean }> {
  if (!query.trim()) {
    return [{ text, matched: false }]
  }

  // Escape all regex special characters so e.g. "." or "*" are treated literally
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(`(${escaped})`, "ig")

  // split() with a capturing group keeps the matched parts in the result array
  return text
    .split(regex)
    .filter(Boolean)
    .map((part) => ({
      text: part,
      // Re-test each part; reset lastIndex because the regex has the `g` flag
      matched: new RegExp(`^${escaped}$`, "i").test(part),
    }))
}
