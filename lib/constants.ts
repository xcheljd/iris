/** Cross-cutting constants used by multiple modules. */

/** Milliseconds in a calendar day. */
export const MS_PER_DAY = 86_400_000;

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
