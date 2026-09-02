/**
 * What makes two email addresses "the same".
 *
 * Four layers used to disagree. The Quick Add UI deduped case-insensitively;
 * `unsubscribe_list.email` is a UNIQUE TEXT column and SQLite TEXT collates
 * BINARY, so it is case-*sensitive*; `addUnsubscribeEmail` matched clients with
 * a plain `eq()`; and `getUnsubscribeList` joins the suppression list to
 * `clients` on the raw columns. Meanwhile the client write path never
 * lowercases (the RVX importer does), so `clients.email` holds mixed case by
 * construction — and a Quick Add of "Alex@Example.com" for a client stored as
 * "alex@example.com" passed every one of those checks, marked nobody
 * unsubscribed, and left a row reading "No client match" forever.
 *
 * Addresses are case-insensitive in practice, so that is the rule here: one
 * `normalizeEmail` for values, one `sameEmail` predicate for SQL.
 */
import { sql as rawSql, type Column, type SQL } from "drizzle-orm";

/** Trimmed and lowercased, or null for anything blank. */
export function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/**
 * `lower(a) = lower(b)` — a case-insensitive email comparison for SQL.
 *
 * Either side may be a column or a plain string; a string is bound as a
 * parameter, and `lower()` around it is harmless when it is already normalized.
 */
export function sameEmail(a: Column | SQL | string, b: Column | SQL | string): SQL {
  return rawSql`lower(${a}) = lower(${b})`;
}
