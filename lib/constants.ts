/** Cross-cutting constants used by multiple modules. */

/** Milliseconds in a calendar day. */
export const MS_PER_DAY = 86_400_000;

/** Seconds in a calendar day (used in raw SQL expressions). */
export const SEC_PER_DAY = 86_400;

/** Maximum rows returned by unbounded list queries. */
export const LIST_QUERY_LIMIT = 10_000;

/**
 * Default cap for page-backing reads that have no pagination of their own
 * (matched clients, prospects). Generous enough that no realistic store hits
 * it, but bounded so a runaway table can't be pulled into a server render.
 * Exports pass LIST_QUERY_LIMIT explicitly to get the full set.
 */
export const PAGE_READ_LIMIT = 1_000;

/** Days of outreach history used to calculate heat score. */
export const HEAT_LOOKBACK_DAYS = 90;

/** Days ahead to surface upcoming follow-ups. */
export const FOLLOW_UP_LOOKAHEAD_DAYS = 7;

/** Minimum password length enforced at account creation and recovery. */
export const MIN_PASSWORD_LENGTH = 6;

/** NextAuth JWT session lifetime in seconds (30 days). */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** bcrypt salt rounds for password hashing. */
export const BCRYPT_SALT_ROUNDS = 10;

/** SQLite database file path (relative to process.cwd()). */
export const DATABASE_PATH = process.env.DATABASE_PATH ?? "data/iris.db";

/** Default page size for paginated lists (20 rows). Components needing a different size override locally. */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Page size for the promo list (15 rows) — the size that surface has always
 * paged at. Shared so `listPromos` and the promos page agree on the offset
 * maths; a mismatch silently skips or repeats rows.
 */
export const PROMO_PAGE_SIZE = 15;

/** Full catalog of known client tags. Shown in the client form's tag picker. */
export const COMMON_TAGS = [
  "VIP", "repeat-buyer", "high-spender", "military", "birthday-this-month",
  "talker", "no-texts", "email-only", "crimson-ace", "meridian", "solar",
  "limited-edition", "mens", "womens", "watch", "collector",
] as const;

/** Curated subset shown as quick-suggestion chips on the tags panel. Intentionally smaller and free of model-name jargon. */
export const SUGGESTED_TAGS = [
  "VIP", "repeat-buyer", "high-spender", "military", "birthday-this-month",
] as const;
