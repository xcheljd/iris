import { addDays, endOfDay, endOfMonth, format, startOfDay, startOfMonth, startOfYear, subDays, subMonths } from "date-fns";

/**
 * Range shortcuts shared by every date-range picker (Analytics, Clients
 * "Dates"). A preset is stored by id, not by its dates, so a saved filter or a
 * shared link stays rolling: "Last 30 days" always means the 30 days up to
 * whenever it is opened. Bounds are local days, `to` is the end of its day
 * (the SQL bounds are inclusive).
 */
export const DATE_PRESETS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "this_year", label: "This year" },
] as const;

export type DatePresetId = (typeof DATE_PRESETS)[number]["id"];

export const DATE_PRESET_IDS = DATE_PRESETS.map((p) => p.id) as [DatePresetId, ...DatePresetId[]];

export function isDatePresetId(v: unknown): v is DatePresetId {
  return typeof v === "string" && (DATE_PRESET_IDS as string[]).includes(v);
}

export function datePresetLabel(id: DatePresetId): string {
  return DATE_PRESETS.find((p) => p.id === id)!.label;
}

/** "Last N days" includes today, so Last 7 days = today and the 6 days before it. */
export function presetRange(id: DatePresetId, now: Date = new Date()): { from: Date; to: Date } {
  const to = endOfDay(now);
  switch (id) {
    case "today": return { from: startOfDay(now), to };
    case "7d": return { from: startOfDay(subDays(now, 6)), to };
    case "30d": return { from: startOfDay(subDays(now, 29)), to };
    case "90d": return { from: startOfDay(subDays(now, 89)), to };
    case "this_month": return { from: startOfMonth(now), to };
    case "last_month": {
      const prev = subMonths(now, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case "this_year": return { from: startOfYear(now), to };
  }
}

const toSec = (d: Date) => Math.floor(d.getTime() / 1000);

/** The preset's bounds as unix seconds, the shape the filters and queries take. */
export function presetRangeSeconds(id: DatePresetId, now?: Date): { from: number; to: number } {
  const { from, to } = presetRange(id, now);
  return { from: toSec(from), to: toSec(to) };
}

/** Human label for a range: the preset's name, "May 1 – May 31, 2026", or the fallback. */
export function describeRange(
  r: { preset?: DatePresetId; from?: Date; to?: Date },
  fallback = "All time",
): string {
  if (r.preset) return datePresetLabel(r.preset);
  if (!r.from && !r.to) return fallback;
  const sameYear = r.from && r.to && r.from.getFullYear() === r.to.getFullYear();
  const f = r.from ? format(r.from, sameYear ? "MMM d" : "MMM d, yyyy") : "…";
  const t = r.to ? format(r.to, "MMM d, yyyy") : "…";
  return `${f} – ${t}`;
}

/** Quick picks for a single future date (follow-ups): days from today. */
export const FOLLOW_UP_PRESETS = [
  { label: "Tomorrow", days: 1 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
] as const;

/** Local midnight N days from today. */
export function daysFromToday(days: number, now: Date = new Date()): Date {
  return startOfDay(addDays(now, days));
}

/**
 * Bounds for the shared calendar's month/year dropdowns: far enough back for
 * birthdays and anniversaries, far enough ahead for promos and follow-ups.
 * Module-level so render stays pure.
 */
const THIS_YEAR = new Date().getFullYear();
export const CALENDAR_START_MONTH = new Date(THIS_YEAR - 100, 0);
export const CALENDAR_END_MONTH = new Date(THIS_YEAR + 5, 11);
