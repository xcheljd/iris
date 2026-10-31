import { describe, it, expect } from "vitest";
import { presetRange, presetRangeSeconds, describeRange, isDatePresetId, daysFromToday, DATE_PRESET_IDS } from "@/lib/date-presets";
import { smartListFiltersSchema } from "@/lib/validation/smart-list";
import { smartListToClientFilters, clientFiltersToSearchParams, getActiveFilterChips } from "@/lib/smart-list-filters";

// Tuesday Oct 13 2026, mid-afternoon local.
const NOW = new Date(2026, 9, 13, 15, 30);
const day = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];

describe("date presets", () => {
  it("Last N days include today, start at local midnight and end at the end of today", () => {
    expect(day(presetRange("7d", NOW).from)).toEqual([2026, 10, 7, 0, 0]);
    expect(day(presetRange("30d", NOW).from)).toEqual([2026, 9, 14, 0, 0]);
    expect(day(presetRange("90d", NOW).from)).toEqual([2026, 7, 16, 0, 0]);
    expect(day(presetRange("7d", NOW).to)).toEqual([2026, 10, 13, 23, 59]);
  });

  it("calendar presets", () => {
    expect(day(presetRange("today", NOW).from)).toEqual([2026, 10, 13, 0, 0]);
    expect(day(presetRange("this_month", NOW).from)).toEqual([2026, 10, 1, 0, 0]);
    const last = presetRange("last_month", NOW);
    expect(day(last.from)).toEqual([2026, 9, 1, 0, 0]);
    expect(day(last.to)).toEqual([2026, 9, 30, 23, 59]);
    expect(day(presetRange("this_year", NOW).from)).toEqual([2026, 1, 1, 0, 0]);
  });

  it("last month across a year boundary", () => {
    const r = presetRange("last_month", new Date(2026, 0, 10));
    expect(day(r.from)).toEqual([2025, 12, 1, 0, 0]);
    expect(day(r.to)).toEqual([2025, 12, 31, 23, 59]);
  });

  it("seconds are whole and inclusive of the last second", () => {
    const s = presetRangeSeconds("today", NOW);
    expect(Number.isInteger(s.from) && Number.isInteger(s.to)).toBe(true);
    expect(s.to - s.from).toBe(86_399);
  });

  it("labels", () => {
    expect(describeRange({ preset: "30d" })).toBe("Last 30 days");
    expect(describeRange({})).toBe("All time");
    expect(describeRange({ from: new Date(2026, 4, 1), to: new Date(2026, 4, 31) })).toBe("May 1 – May 31, 2026");
    expect(describeRange({ from: new Date(2025, 11, 20), to: new Date(2026, 0, 5) })).toBe("Dec 20, 2025 – Jan 5, 2026");
  });

  it("validates ids", () => {
    expect(isDatePresetId("30d")).toBe(true);
    expect(isDatePresetId("31d")).toBe(false);
    expect(isDatePresetId(undefined)).toBe(false);
    expect(DATE_PRESET_IDS).toHaveLength(7);
  });

  it("follow-up quick picks are local midnight N days out", () => {
    expect(day(daysFromToday(1, NOW))).toEqual([2026, 10, 14, 0, 0]);
    expect(day(daysFromToday(30, NOW))).toEqual([2026, 11, 12, 0, 0]);
  });
});

describe("rolling ranges in saved filters", () => {
  it("the smart-list schema accepts shortcut ids and rejects unknown ones", () => {
    expect(smartListFiltersSchema.safeParse({ lastContactRange: "30d", createdRange: "this_year" }).success).toBe(true);
    expect(smartListFiltersSchema.safeParse({ lastContactRange: "45d" }).success).toBe(false);
  });

  it("round-trips through a saved list, the URL and the chips", () => {
    const f = smartListToClientFilters({ lastContactRange: "30d", createdRange: "last_month", bogus: 1 });
    expect(f).toMatchObject({ lastContactRange: "30d", createdRange: "last_month" });
    const sp = clientFiltersToSearchParams(f);
    expect(sp.get("lastContactRange")).toBe("30d");
    expect(sp.get("createdRange")).toBe("last_month");
    expect(getActiveFilterChips(f).map((c) => c.label)).toEqual(["Last Contact: Last 30 days", "Created: Last month"]);
  });

  it("drops an invalid stored shortcut instead of trusting it", () => {
    expect(smartListToClientFilters({ lastContactRange: "forever" }).lastContactRange).toBeUndefined();
  });
});
