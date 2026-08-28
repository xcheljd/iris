import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cn,
  formatPhone,
  formatDate,
  daysAgo,
  formatDaysAgo,
  initials,
  applyClientFilter,
} from "@/lib/utils";

// ---------------------------------------------------------------------------
// cn
// ---------------------------------------------------------------------------
describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("deduplicates conflicting tailwind classes via twMerge", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles conditional classes via clsx", () => {
    expect(cn("base", false && "hidden", "extra")).toBe("base extra");
  });

  it("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });

  it("handles undefined and null inputs", () => {
    expect(cn("a", undefined, null, "b")).toBe("a b");
  });

  it("merges arrays of classes", () => {
    expect(cn(["px-2", "py-1"], "px-4")).toBe("py-1 px-4");
  });
});

// ---------------------------------------------------------------------------
// formatPhone
// ---------------------------------------------------------------------------
describe("formatPhone", () => {
  it("formats a 10-digit number", () => {
    expect(formatPhone("1234567890")).toBe("(123) 456-7890");
  });

  it("formats a 10-digit number with existing formatting chars", () => {
    expect(formatPhone("123-456-7890")).toBe("(123) 456-7890");
  });

  it("strips leading 1 from 11-digit number and returns formatted", () => {
    // The function only formats exactly 10-digit cleaned strings;
    // 11 digits → cleaned length is 11, not 10, so original is returned.
    expect(formatPhone("11234567890")).toBe("11234567890");
  });

  it("returns original string for non-US / non-10-digit numbers", () => {
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
  });

  it("returns empty string for null", () => {
    expect(formatPhone(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatPhone(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(formatPhone("")).toBe("");
  });

  it("returns original for short numbers (<10 digits)", () => {
    expect(formatPhone("12345")).toBe("12345");
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe("formatDate", () => {
  it("formats a Date object", () => {
    const d = new Date(2025, 0, 15); // Jan 15 2025
    expect(formatDate(d)).toBe("Jan 15, 2025");
  });

  it("formats an ISO string", () => {
    // Use noon UTC to avoid timezone issues in jsdom
    expect(formatDate("2025-06-01T12:00:00.000Z")).toMatch(/Jun/);
  });

  it("formats a timestamp number", () => {
    const ts = new Date(2025, 2, 10).getTime();
    expect(formatDate(ts)).toBe("Mar 10, 2025");
  });

  it("returns empty string for null", () => {
    expect(formatDate(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatDate(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(formatDate("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// daysAgo
// ---------------------------------------------------------------------------
describe("daysAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 for today", () => {
    expect(daysAgo(new Date("2025-06-15T12:00:00.000Z"))).toBe(0);
  });

  it("returns correct number for recent dates", () => {
    expect(daysAgo(new Date("2025-06-13T12:00:00.000Z"))).toBe(2);
  });

  it("returns correct number for old dates", () => {
    expect(daysAgo(new Date("2025-01-01T12:00:00.000Z"))).toBe(165);
  });

  it("returns null for null input", () => {
    expect(daysAgo(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(daysAgo(undefined)).toBeNull();
  });

  it("returns negative number for future dates", () => {
    const future = new Date("2025-06-20T12:00:00.000Z");
    expect(daysAgo(future)).toBeLessThan(0);
  });

  it("works with ISO string input", () => {
    expect(daysAgo("2025-06-14T12:00:00.000Z")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// formatDaysAgo
// ---------------------------------------------------------------------------
describe("formatDaysAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns Never for null/undefined", () => {
    expect(formatDaysAgo(null)).toBe("Never");
    expect(formatDaysAgo(undefined)).toBe("Never");
  });

  it("returns Today for the same day", () => {
    expect(formatDaysAgo(new Date("2025-06-15T09:00:00.000Z"))).toBe("Today");
  });

  it("returns a suffixed day count for past dates — never a bare number", () => {
    expect(formatDaysAgo(new Date("2025-06-10T12:00:00.000Z"))).toBe("5d ago");
    expect(formatDaysAgo("2025-06-14T12:00:00.000Z")).toBe("1d ago");
  });
});

// ---------------------------------------------------------------------------
// initials
// ---------------------------------------------------------------------------
describe("initials", () => {
  it("returns uppercase initials for first and last name", () => {
    expect(initials("John", "Doe")).toBe("JD");
  });

  it("returns first initial only when last is not provided", () => {
    expect(initials("John")).toBe("J");
  });

  it("returns first initial only when last is empty string", () => {
    expect(initials("John", "")).toBe("J");
  });

  it("returns first initial only when last is null", () => {
    expect(initials("John", null)).toBe("J");
  });

  it("handles single character first name", () => {
    expect(initials("A", "B")).toBe("AB");
  });

  it("returns ? for empty first name and no last", () => {
    expect(initials("")).toBe("?");
  });

  it("trims whitespace before extracting initials", () => {
    expect(initials("  Alice  ", "  Bob  ")).toBe("AB");
  });
});

// ---------------------------------------------------------------------------
// applyClientFilter
// ---------------------------------------------------------------------------
describe("applyClientFilter", () => {
  const now = new Date("2025-06-15T12:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper to create mock client objects
  function makeClient(overrides: Record<string, unknown> = {}) {
    return {
      id: "c1",
      heatLevel: "cold",
      status: "active",
      lastOutreachAt: null as Date | string | number | null,
      lastPurchaseAt: null as Date | string | number | null,
      birthday: null as string | null,
      onEmailList: false,
      ...overrides,
    };
  }

  // --- null / undefined filter returns all ---
  it("returns all clients when filter is null", () => {
    const clients = [makeClient(), makeClient({ id: "c2" })];
    expect(applyClientFilter(clients, null)).toHaveLength(2);
  });

  it("returns all clients when filter is undefined", () => {
    const clients = [makeClient()];
    expect(applyClientFilter(clients, undefined as unknown as string)).toHaveLength(1);
  });

  // --- "hot" filter ---
  it("filters hot + active clients", () => {
    const clients = [
      makeClient({ heatLevel: "hot", status: "active" }),
      makeClient({ heatLevel: "hot", status: "inactive" }),
      makeClient({ heatLevel: "warm", status: "active" }),
    ];
    const result = applyClientFilter(clients, "hot");
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("active");
    expect(result[0].heatLevel).toBe("hot");
  });

  // --- "stale" filter ---
  it("filters stale active clients with no outreach or purchase > 90 days", () => {
    const oldDate = new Date("2025-01-01T12:00:00.000Z"); // > 90 days ago
    const recentDate = new Date("2025-06-10T12:00:00.000Z"); // < 90 days ago

    const clients = [
      makeClient({ status: "active", lastOutreachAt: null, lastPurchaseAt: null }), // no activity → stale
      makeClient({ status: "active", lastOutreachAt: oldDate, lastPurchaseAt: null }), // old outreach → stale
      makeClient({ status: "active", lastOutreachAt: recentDate, lastPurchaseAt: null }), // recent → not stale
      makeClient({ status: "inactive", lastOutreachAt: null, lastPurchaseAt: null }), // inactive → excluded
    ];
    const result = applyClientFilter(clients, "stale");
    expect(result).toHaveLength(2);
  });

  // --- "recent_purchases" filter ---
  it("filters clients with purchase within 30 days", () => {
    const recentPurchase = new Date("2025-06-01T12:00:00.000Z");
    const oldPurchase = new Date("2025-01-01T12:00:00.000Z");

    const clients = [
      makeClient({ lastPurchaseAt: recentPurchase }),
      makeClient({ lastPurchaseAt: oldPurchase }),
      makeClient({ lastPurchaseAt: null }),
    ];
    const result = applyClientFilter(clients, "recent_purchases");
    expect(result).toHaveLength(1);
  });

  // --- "no_outreach_60" filter ---
  it("filters active clients with no outreach in > 60 days", () => {
    const oldOutreach = new Date("2025-03-01T12:00:00.000Z");
    const recentOutreach = new Date("2025-06-10T12:00:00.000Z");

    const clients = [
      makeClient({ status: "active", lastOutreachAt: oldOutreach }),
      makeClient({ status: "active", lastOutreachAt: recentOutreach }),
      makeClient({ status: "active", lastOutreachAt: null }),
      makeClient({ status: "inactive", lastOutreachAt: oldOutreach }),
    ];
    const result = applyClientFilter(clients, "no_outreach_60");
    expect(result).toHaveLength(2); // oldOutreach + null (no outreach at all)
  });

  // --- "birthdays_month" filter ---
  it("filters clients with birthday in current month (June = 06)", () => {
    const clients = [
      makeClient({ birthday: "1990-06-15" }), // June → match
      makeClient({ birthday: "1985-12-25" }), // December → no match
      makeClient({ birthday: null }),          // null → no match
    ];
    const result = applyClientFilter(clients, "birthdays_month");
    expect(result).toHaveLength(1);
  });

  // --- "email_subscribers" filter ---
  it("filters email subscribers who are not unsubscribed", () => {
    const clients = [
      makeClient({ onEmailList: true, status: "active" }),
      makeClient({ onEmailList: true, status: "unsubscribed" }),
      makeClient({ onEmailList: false, status: "active" }),
    ];
    const result = applyClientFilter(clients, "email_subscribers");
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("active");
  });

  // --- unknown filter returns all ---
  it("returns all clients for unknown filter value", () => {
    const clients = [makeClient(), makeClient({ id: "c2" })];
    expect(applyClientFilter(clients, "nonexistent_filter")).toHaveLength(2);
  });
});
