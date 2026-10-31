/**
 * Translate user search input into a safe FTS5 MATCH expression.
 *
 * Rules:
 *   • Tokens are split on whitespace.
 *   • Each token is wrapped in double-quotes (treated as a phrase) so any
 *     special FTS5 characters (AND, OR, NEAR, *, parentheses, hyphens) are
 *     neutralized.
 *   • A trailing `*` is appended to every token for prefix matching, so
 *     "smi" matches "smith".
 *   • Tokens are combined with the implicit AND operator (the default in
 *     FTS5 when no operator is given).
 *   • Embedded double-quotes are escaped by doubling them, per the FTS5 spec.
 *
 * Returns `null` if the query is empty after trimming, so callers can skip
 * the FTS join entirely (rather than match everything).
 */
export function toFtsQuery(input: string): string | null {
  const tokens = input
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;

  return tokens
    .map((t) => {
      const escaped = t.replace(/"/g, '""');
      return `"${escaped}"*`;
    })
    .join(" ");
}
