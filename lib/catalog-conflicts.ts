import type { CatalogConflict } from "@/lib/actions/model-catalog";

/**
 * Build a non-blocking warning message for manual model→collection
 * conflicts returned by a client/prospect save. The stored catalog value
 * is always kept; the disagreement is also flagged for manager review on
 * /catalog. Returns null when there is nothing to warn about.
 */
export function catalogConflictMessage(
  conflicts: CatalogConflict[] | undefined | null,
): string | null {
  if (!conflicts || conflicts.length === 0) return null;
  if (conflicts.length === 1) {
    const c = conflicts[0];
    return `${c.model} is cataloged as “${c.existing}” — kept that (you entered “${c.attempted}”). Flagged for manager review.`;
  }
  const models = conflicts.map((c) => c.model).join(", ");
  return `${conflicts.length} models conflict with the catalog and were kept as cataloged (${models}). Flagged for manager review.`;
}
