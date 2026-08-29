import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { MS_PER_DAY } from "./constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

export function formatDate(d: Date | string | number | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * A Date rendered as the calendar day the user actually picked — local
 * year/month/day, never UTC. `toISOString()` shifts the day for anyone west of
 * Greenwich (a local-midnight Aug 29 becomes "2026-08-29T07:00:00.000Z", and
 * east of it the date part rolls back a day), so day-precision columns
 * (birthday, anniversary) must be serialised from the local parts.
 */
export function toDateOnly(d: Date | null | undefined): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * A stored birthday/anniversary as a local-midnight Date. These columns are
 * TEXT and hold two shapes in the wild: the canonical "YYYY-MM-DD" (seed,
 * imports, and every write since toDateOnly) and a full ISO timestamp from
 * older form submits that JSON-serialised a Date. Both start with the calendar
 * date, so we read the leading 10 chars and build the Date from the parts —
 * `new Date("2000-08-13")` parses as UTC midnight, which is Aug 12 west of
 * Greenwich. Anything else (e.g. a hand-typed "12/25") yields null.
 */
export function parseOccasionDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Human label for a birthday/anniversary. Unparseable values are passed
 * through unchanged rather than rendered as "Invalid Date".
 */
export function formatOccasionDate(value: string | null | undefined, pattern = "MMM d"): string {
  if (!value) return "";
  const date = parseOccasionDate(value);
  return date ? format(date, pattern) : value;
}

export function daysAgo(d: Date | string | number | null | undefined): number | null {
  if (!d) return null;
  const ms = Date.now() - new Date(d).getTime();
  return Math.floor(ms / MS_PER_DAY);
}

const MONEY_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/**
 * USD money for display: "$12,500.00". Null/undefined renders an em dash
 * rather than "$0.00" — a missing price is not a free watch.
 */
export function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return MONEY_FORMAT.format(n);
}

/**
 * Human-readable "how long ago" label for a timestamp — the display counterpart
 * to daysAgo(). Null/undefined dates read "Never" rather than a bare number.
 */
export function formatDaysAgo(d: Date | string | number | null | undefined): string {
  const days = daysAgo(d);
  if (days === null) return "Never";
  if (days === 0) return "Today";
  return `${days}d ago`;
}

export function fullName(person: { firstName: string; lastName?: string | null }): string {
  return [person.firstName, person.lastName].filter(Boolean).join(" ");
}

export function initials(first: string, last?: string | null): string {
  const f = (first || "").trim()[0] || "";
  const l = (last || "").trim()[0] || "";
  return (f + l).toUpperCase() || "?";
}

// ── Smart-list filter thresholds (days) ──────────────────────────────
const STALE_THRESHOLD_DAYS = 90;
const RECENT_PURCHASE_DAYS = 30;
const NO_OUTREACH_DAYS = 60;
// ─────────────────────────────────────────────────────────────────────

export function applyClientFilter<T extends { heatLevel: string; status: string; lastOutreachAt: Date | string | number | null; lastPurchaseAt: Date | string | number | null; birthday: string | null; anniversary: string | null; onEmailList: boolean }>(all: T[], filter: string | null): T[] {
  if (!filter) return all;
  const now = Date.now();
  switch (filter) {
    case "hot":
      return all.filter((c) => c.heatLevel === "hot" && c.status === "active");
    case "stale":
      return all.filter((c) => {
        if (!c.lastOutreachAt && !c.lastPurchaseAt) return c.status === "active";
        const last = Math.max(
          c.lastOutreachAt ? new Date(c.lastOutreachAt).getTime() : 0,
          c.lastPurchaseAt ? new Date(c.lastPurchaseAt).getTime() : 0,
        );
        return c.status === "active" && (now - last) > STALE_THRESHOLD_DAYS * MS_PER_DAY;
      });
    case "recent_purchases":
      return all.filter((c) => c.lastPurchaseAt && (now - new Date(c.lastPurchaseAt).getTime()) < RECENT_PURCHASE_DAYS * MS_PER_DAY);
    case "no_outreach_60":
      return all.filter((c) => c.status === "active" && (!c.lastOutreachAt || (now - new Date(c.lastOutreachAt).getTime()) > NO_OUTREACH_DAYS * MS_PER_DAY));
    case "birthdays_month":
    case "anniversaries_month": {
      const month = new Date().getMonth() + 1;
      const field = filter === "birthdays_month" ? "birthday" : "anniversary";
      return all.filter((c) => {
        const value = c[field];
        if (!value) return false;
        const m = parseInt(value.split("-")[1] || "0", 10);
        return m === month;
      });
    }
    case "email_subscribers":
      return all.filter((c) => c.onEmailList && c.status !== "unsubscribed");
    default:
      return all;
  }
}
