/**
 * Model numbers are `[A-Z0-9-]` with letters always uppercase
 * (e.g. "MV-2102-BLK"). Normalize any user-entered model to that form.
 * `.toUpperCase()` leaves digits and hyphens untouched, so a trimmed
 * upper-case is sufficient. Returns "" for empty/whitespace input.
 */
export function normalizeModel(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase();
}
