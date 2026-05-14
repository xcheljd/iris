/**
 * Smart List ↔ Clients page filter translation.
 *
 * Smart Lists store filters as a JSON blob (Record<string, unknown>). The
 * Clients page expresses filters as URL search params with specific names
 * (q, nameQ, contactQ, heat, owner, tags, tagMode, dates). This module is
 * the single place that converts between the two shapes, including
 * backwards compatibility for the legacy smart-list filter keys
 * (heatLevel, source, onEmailList, stale, birthdayMonth, tag/tags).
 */

import type { ClientFilterParams } from "@/lib/client-filter-conds";

/** Smart-list filter shape — same keys as ClientFilterParams plus a few legacy/extra ones. */
export interface SmartListFilters extends ClientFilterParams {
  /** Legacy: was used before unification; prefer `heat`. */
  heatLevel?: string;
  /** Smart-list-only filter: clients.source value (e.g. "Walk-in"). */
  source?: string;
  /** Smart-list-only filter: only clients with onEmailList=true. */
  onEmailList?: boolean;
  /** Smart-list-only filter: stale (90+ days since outreach or purchase). */
  stale?: boolean;
  /** Smart-list-only filter: month substring of clients.birthday. */
  birthdayMonth?: string;
  /** Legacy alt to `tags`: a single tag. */
  tag?: string;
}

/**
 * Resolve a smart-list filter blob into the shared ClientFilterParams shape.
 * Reads both legacy keys (heatLevel, single `tag`) and new keys (heat, tags,
 * tagMode, etc.), preferring the new keys when both are present.
 */
export function smartListToClientFilters(raw: Record<string, unknown>): ClientFilterParams {
  const f = raw as SmartListFilters;
  const out: ClientFilterParams = {};

  if (typeof f.q === "string" && f.q) out.q = f.q;
  if (typeof f.nameQ === "string" && f.nameQ) out.nameQ = f.nameQ;
  if (typeof f.contactQ === "string" && f.contactQ) out.contactQ = f.contactQ;

  // Prefer new `heat`, fall back to legacy `heatLevel`
  if (typeof f.heat === "string" && f.heat && f.heat !== "any") {
    out.heat = f.heat;
  } else if (typeof f.heatLevel === "string" && f.heatLevel) {
    out.heat = f.heatLevel;
  }

  if (typeof f.owner === "string" && f.owner && f.owner !== "any") out.owner = f.owner;

  // Prefer new `tags` array, fall back to legacy single `tag`
  if (Array.isArray(f.tags) && f.tags.length > 0) {
    out.tags = f.tags.filter((t): t is string => typeof t === "string");
  } else if (typeof f.tag === "string" && f.tag) {
    out.tags = [f.tag];
  }
  if (f.tagMode === "all") out.tagMode = "all";

  if (typeof f.lastContactFrom === "number") out.lastContactFrom = f.lastContactFrom;
  if (typeof f.lastContactTo === "number") out.lastContactTo = f.lastContactTo;
  if (typeof f.createdFrom === "number") out.createdFrom = f.createdFrom;
  if (typeof f.createdTo === "number") out.createdTo = f.createdTo;

  return out;
}

/** Human-readable chip strings describing each active filter. Format-only — no JSX. */
export function describeClientFilters(f: ClientFilterParams): string[] {
  const chips: string[] = [];
  if (f.q && f.q.trim()) chips.push(`Search: "${f.q.trim()}"`);
  if (f.nameQ && f.nameQ.trim()) chips.push(`Name: "${f.nameQ.trim()}"`);
  if (f.contactQ && f.contactQ.trim()) chips.push(`Contact: "${f.contactQ.trim()}"`);
  if (f.heat && f.heat !== "any") chips.push(`Heat: ${f.heat}`);
  if (f.owner && f.owner !== "any") {
    chips.push(`Owner: ${f.owner === "__none__" ? "Unassigned" : f.owner}`);
  }
  if (f.tags && f.tags.length > 0) {
    const mode = f.tagMode === "all" ? "all of" : "any of";
    chips.push(`Tags (${mode}): ${f.tags.join(", ")}`);
  }
  const fmt = (ts: number) => new Date(ts * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const range = (from?: number, to?: number) => {
    if (!from && !to) return null;
    return `${from ? fmt(from) : "—"} → ${to ? fmt(to) : "—"}`;
  };
  const lastContact = range(f.lastContactFrom, f.lastContactTo);
  if (lastContact) chips.push(`Last Contact: ${lastContact}`);
  const created = range(f.createdFrom, f.createdTo);
  if (created) chips.push(`Created: ${created}`);
  return chips;
}

/** Returns true if any user-driven filter is active. */
export function hasActiveClientFilters(f: ClientFilterParams): boolean {
  return Boolean(
    f.q ||
    f.nameQ ||
    f.contactQ ||
    (f.heat && f.heat !== "any") ||
    (f.owner && f.owner !== "any") ||
    (f.tags && f.tags.length > 0) ||
    f.lastContactFrom ||
    f.lastContactTo ||
    f.createdFrom ||
    f.createdTo,
  );
}

/**
 * Serialize ClientFilterParams to URLSearchParams for /clients navigation.
 * Mirrors the navigate() logic in clients-content.tsx so deep links work.
 */
export function clientFiltersToSearchParams(f: ClientFilterParams): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.nameQ) sp.set("nameQ", f.nameQ);
  if (f.contactQ) sp.set("contactQ", f.contactQ);
  if (f.heat && f.heat !== "any") sp.set("heat", f.heat);
  if (f.owner && f.owner !== "any") sp.set("owner", f.owner);
  if (f.tags && f.tags.length > 0) sp.set("tags", f.tags.join(","));
  if (f.tagMode === "all") sp.set("tagMode", "all");
  if (f.lastContactFrom) sp.set("lastContactFrom", String(f.lastContactFrom));
  if (f.lastContactTo) sp.set("lastContactTo", String(f.lastContactTo));
  if (f.createdFrom) sp.set("createdFrom", String(f.createdFrom));
  if (f.createdTo) sp.set("createdTo", String(f.createdTo));
  return sp;
}
