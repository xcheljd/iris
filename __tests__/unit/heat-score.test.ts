import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { calcHeatScore } from "@/lib/heat-score";
import { MS_PER_DAY } from "@/lib/constants";
import type { ProductOfInterest, OutreachLog } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reference "now" used by all tests via fake timers. */
const NOW = new Date("2025-06-15T12:00:00.000Z");

/** Minimal client shape accepted by calcHeatScore. */
function makeClient(
  overrides: Partial<{
    onEmailList: boolean;
    productsOfInterest: ProductOfInterest[];
    birthday: string | null;
    status: "active" | "inactive" | "banned" | "unsubscribed" | "deleted";
    lastOutreachAt: Date | null;
    lastPurchaseAt: Date | null;
  }> = {},
) {
  return {
    onEmailList: false,
    productsOfInterest: [] as ProductOfInterest[],
    birthday: null as string | null,
    status: "active" as const,
    lastOutreachAt: null as Date | null,
    lastPurchaseAt: null as Date | null,
    ...overrides,
  };
}

/** Create an outreach entry at a given offset from NOW (negative = past). */
function outreach(outcome: OutreachLog["outcome"], daysOffset: number) {
  return { outcome, date: new Date(NOW.getTime() + daysOffset * MS_PER_DAY) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("calcHeatScore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Base case ---
  it("returns score 0 and level cold with no signals and no outreach", () => {
    // No purchase, no outreach, no email list, no products, no birthday,
    // no lastOutreachAt. No penalty for never being contacted, but also
    // nothing positive — score 0.
    const result = calcHeatScore(makeClient(), []);
    expect(result.score).toBe(0);
    expect(result.level).toBe("cold");
  });

  // --- Purchase signals ---
  it("adds 30 for any lastPurchaseAt", () => {
    // Purchase at 60 days ago → +30 base + 25 (≤90 days) = 55
    const client = makeClient({ lastPurchaseAt: new Date("2025-04-16T12:00:00.000Z") });
    const result = calcHeatScore(client, []);
    expect(result.score).toBe(55);
    expect(result.level).toBe("warm");
  });

  it("adds 30 only (no ≤90 bonus) when purchase is > 90 days old", () => {
    const client = makeClient({
      lastPurchaseAt: new Date("2025-01-01T12:00:00.000Z"),
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"), // recent → no penalty
    });
    const result = calcHeatScore(client, []);
    expect(result.score).toBe(30);
  });

  it("adds both 30 and 25 when lastPurchaseAt is within 90 days", () => {
    const client = makeClient({
      lastPurchaseAt: new Date("2025-05-01T12:00:00.000Z"),
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, []);
    expect(result.score).toBe(55);
  });

  // --- Positive response outreach ---
  it("adds 15 for 'responded' outcome within outreach logs", () => {
    const client = makeClient({
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, [outreach("responded", -5)]);
    expect(result.score).toBe(15);
  });

  it("adds 15 for 'wants_to_come_in' outcome", () => {
    const client = makeClient({
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, [outreach("wants_to_come_in", -10)]);
    expect(result.score).toBe(15);
  });

  it("adds 15 for 'purchased' outcome", () => {
    const client = makeClient({
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, [outreach("purchased", -3)]);
    expect(result.score).toBe(15);
  });

  it("does not add bonus for non-positive outcomes like 'no_answer'", () => {
    const client = makeClient({
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, [outreach("no_answer", -5)]);
    expect(result.score).toBe(0);
  });

  // --- Email list ---
  it("adds 10 when onEmailList is true", () => {
    const client = makeClient({
      onEmailList: true,
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, []);
    expect(result.score).toBe(10);
  });

  // --- Products of interest ---
  it("adds 10 when productsOfInterest is non-empty", () => {
    const client = makeClient({
      productsOfInterest: [{ model: "DEEPSTONE", collection: null, brand: null, intent: "interested" }],
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, []);
    expect(result.score).toBe(10);
  });

  it("does not add bonus when productsOfInterest is empty array", () => {
    const client = makeClient({
      productsOfInterest: [],
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, []);
    expect(result.score).toBe(0);
  });

  // --- Birthday ---
  it("adds 10 when birthday is non-null", () => {
    const client = makeClient({
      birthday: "1990-06-15",
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, []);
    expect(result.score).toBe(10);
  });

  // --- Outreach staleness penalties ---
  it("penalizes -15 when lastOutreachAt is > 90 days ago", () => {
    // lastOutreachAt 100 days ago → -15, no positive signals → clamped to 0
    const client = makeClient({
      lastOutreachAt: new Date("2025-03-06T12:00:00.000Z"), // ~101 days ago
    });
    const result = calcHeatScore(client, []);
    expect(result.score).toBe(0);
  });

  it("penalizes -25 total when lastOutreachAt is > 180 days ago (-15 -10)", () => {
    // Set up: lastOutreachAt 200 days ago → -15 -10 = -25
    // With email list +10 and birthday +10: 20 - 25 = -5, clamped to 0
    const client = makeClient({
      lastOutreachAt: new Date("2024-11-27T12:00:00.000Z"), // ~200 days ago
      onEmailList: true,   // +10
      birthday: "1990-01-01", // +10
    });
    const result = calcHeatScore(client, []);
    expect(result.score).toBe(0);
  });

  // --- Never contacted ---
  it("does NOT penalize a never-contacted client (null lastOutreachAt)", () => {
    // A brand-new client is not a lapsed one. Previously null read as
    // Infinity and double-fired both penalties (-25); now it is neutral.
    const client = makeClient({
      onEmailList: true,       // +10
      birthday: "1990-01-01",  // +10
      // lastOutreachAt defaults to null
    });
    const result = calcHeatScore(client, []);
    expect(result.score).toBe(20);
    expect(result.level).toBe("cold");
  });

  // --- Unsubscribed ---
  it("penalizes -20 when status is 'unsubscribed'", () => {
    const client = makeClient({
      status: "unsubscribed",
      onEmailList: true, // +10
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, []);
    // +10 (email) -20 (unsub) = -10, clamped to 0
    expect(result.score).toBe(0);
  });

  // --- Tier boundaries ---
  it("returns level 'cold' when score < 40", () => {
    const client = makeClient({
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"), // no penalty
      onEmailList: true, // +10
      birthday: "1990-01-01", // +10
    });
    const result = calcHeatScore(client, []);
    expect(result.score).toBe(20);
    expect(result.level).toBe("cold");
  });

  it("returns level 'warm' at the cold/warm boundary (score 40)", () => {
    const client = makeClient({
      lastPurchaseAt: new Date("2025-01-01T12:00:00.000Z"), // +30 (old purchase)
      onEmailList: true,                                     // +10
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),  // no penalty
    });
    const result = calcHeatScore(client, []);
    expect(result.score).toBe(40);
    expect(result.level).toBe("warm");
  });

  it("returns level 'hot' at the warm/hot boundary (score 70)", () => {
    const client = makeClient({
      lastPurchaseAt: new Date("2025-05-01T12:00:00.000Z"), // +30 +25
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"), // no penalty
    });
    const result = calcHeatScore(client, [outreach("responded", -5)]); // +15
    expect(result.score).toBe(70);
    expect(result.level).toBe("hot");
  });

  // --- Maximum achievable score ---
  // INVARIANT (plan 019 maintenance note): the maximum achievable score must
  // be >= HEAT_THRESHOLD_HOT, or the hot tier silently becomes unreachable
  // again. This test pins the full-engagement ceiling at 100.
  it("reaches 100 with every positive signal set — 'hot' is reachable", () => {
    const maxedClient = makeClient({
      lastPurchaseAt: new Date("2025-06-01T12:00:00.000Z"), // +30 purchase, +25 within 90d
      onEmailList: true,                                     // +10
      productsOfInterest: [
        { model: "SUNLAP", collection: null, brand: null, intent: "interested" },
        { model: "SUB", collection: null, brand: null, intent: "interested" },
      ],                                                     // +10 (presence only)
      birthday: "1985-03-15",                                // +10
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),  // no staleness penalty
      status: "active",                                      // no unsubscribe penalty
    });
    const outreachLogs = [
      outreach("responded", -5),         // +15, awarded once
      outreach("wants_to_come_in", -20), // same boolean — no additional points
    ];

    const result = calcHeatScore(maxedClient, outreachLogs);
    expect(result.score).toBe(100);
    expect(result.level).toBe("hot");
  });

  it("clamps score to 0 minimum", () => {
    const client = makeClient({
      status: "unsubscribed",                                  // -20
      lastOutreachAt: new Date("2024-06-01T12:00:00.000Z"),  // >180 days → -25
    });
    const result = calcHeatScore(client, []);
    // -25 -20 = -45, clamped to 0
    expect(result.score).toBe(0);
    expect(result.level).toBe("cold");
  });

  it("clamps score to 100 maximum", () => {
    const client = makeClient({
      lastPurchaseAt: new Date("2025-06-01T12:00:00.000Z"), // +30 +25
      onEmailList: true,                                     // +10
      productsOfInterest: [{ model: "SUB", collection: null, brand: null, intent: "interested" }], // +10
      birthday: "1990-01-01",                                 // +10
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),  // no penalty
    });
    const result = calcHeatScore(client, [outreach("responded", -5)]); // +15
    // 30 + 25 + 15 + 10 + 10 + 10 = 100
    expect(result.score).toBe(100);
    expect(result.level).toBe("hot");
  });
});
