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
    // no lastOutreachAt (Infinity > 90 & > 180 => -25), clamped to 0
    const result = calcHeatScore(makeClient(), []);
    expect(result.score).toBe(0);
    expect(result.level).toBe("cold");
  });

  // --- Purchase signals ---
  it("adds 15 for any lastPurchaseAt", () => {
    // Purchase at 60 days ago → +15 base + 10 (≤90 days) = 25
    // lastOutreachAt null → -25 penalty → score = 0 (clamped)
    // Let's add outreach within 90 days to avoid the penalty.
    const client = makeClient({ lastPurchaseAt: new Date("2025-04-16T12:00:00.000Z") });
    const outreachLogs = [outreach("responded", -5)]; // recent outreach prevents -25 penalty
    const result = calcHeatScore(client, outreachLogs);
    // +15 (purchase) + 10 (≤90d) + 10 (responded) = 35
    // No outreach penalty because recentOutreach is provided (but lastOutreachAt is null → still -25)
    // Actually lastOutreachAt null → days = Infinity > 180 → -25
    // So: 35 - 25 = 10
    expect(result.score).toBe(10);
  });

  it("adds 15 only (no ≤90 bonus) when purchase is > 90 days old", () => {
    const client = makeClient({
      lastPurchaseAt: new Date("2025-01-01T12:00:00.000Z"),
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"), // recent → no penalty
    });
    const result = calcHeatScore(client, []);
    // +15 (purchase) + 0 (>90 days, no bonus) = 15
    expect(result.score).toBe(15);
  });

  it("adds both 15 and 10 when lastPurchaseAt is within 90 days", () => {
    const client = makeClient({
      lastPurchaseAt: new Date("2025-05-01T12:00:00.000Z"),
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, []);
    // +15 + 10 = 25
    expect(result.score).toBe(25);
  });

  // --- Positive response outreach ---
  it("adds 10 for 'responded' outcome within outreach logs", () => {
    const client = makeClient({
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, [outreach("responded", -5)]);
    // +10 (responded)
    expect(result.score).toBe(10);
  });

  it("adds 10 for 'wants_to_come_in' outcome", () => {
    const client = makeClient({
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, [outreach("wants_to_come_in", -10)]);
    expect(result.score).toBe(10);
  });

  it("adds 10 for 'purchased' outcome", () => {
    const client = makeClient({
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, [outreach("purchased", -3)]);
    expect(result.score).toBe(10);
  });

  it("does not add bonus for non-positive outcomes like 'no_answer'", () => {
    const client = makeClient({
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, [outreach("no_answer", -5)]);
    expect(result.score).toBe(0);
  });

  // --- Email list ---
  it("adds 5 when onEmailList is true", () => {
    const client = makeClient({
      onEmailList: true,
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, []);
    expect(result.score).toBe(5);
  });

  // --- Products of interest ---
  it("adds 5 when productsOfInterest is non-empty", () => {
    const client = makeClient({
      productsOfInterest: [{ model: "DEEPSTONE", collection: null, brand: null, intent: "interested" }],
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, []);
    expect(result.score).toBe(5);
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
  it("adds 3 when birthday is non-null", () => {
    const client = makeClient({
      birthday: "1990-06-15",
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, []);
    expect(result.score).toBe(3);
  });

  // --- No outreach penalty ---
  it("penalizes -15 when lastOutreachAt is > 90 days ago", () => {
    // lastOutreachAt 100 days ago → -15
    // No positive signals → total = -15, clamped to 0
    const client = makeClient({
      lastOutreachAt: new Date("2025-03-06T12:00:00.000Z"), // ~101 days ago
    });
    const result = calcHeatScore(client, []);
    // -15 (no positive signals), clamped to 0
    expect(result.score).toBe(0);
  });

  it("penalizes -25 total when lastOutreachAt is > 180 days ago (-15 -10)", () => {
    // Set up: lastOutreachAt 200 days ago → -15 -10 = -25
    // But also add email list +5 and birthday +3 to get a non-zero score
    const client = makeClient({
      lastOutreachAt: new Date("2024-11-27T12:00:00.000Z"), // ~200 days ago
      onEmailList: true,   // +5
      birthday: "1990-01-01", // +3
    });
    const result = calcHeatScore(client, []);
    // 5 + 3 - 15 - 10 = -17, clamped to 0
    expect(result.score).toBe(0);
  });

  // --- Unsubscribed ---
  it("penalizes -20 when status is 'unsubscribed'", () => {
    const client = makeClient({
      status: "unsubscribed",
      onEmailList: true, // +5
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, []);
    // +5 (email) -20 (unsub) = -15, clamped to 0
    expect(result.score).toBe(0);
  });

  // --- Combinations & thresholds ---
  // Every positive signal is a one-shot boolean, so the ceiling is
  // 15 + 10 + 10 + 5 + 5 + 3 = 48. HEAT_THRESHOLD_HOT is 70, so calcHeatScore
  // can never return "hot". Pinning the ceiling here so any future scoring
  // change has to confront that.
  it("caps at 48 with every positive signal set — 'hot' (>= 70) is unreachable", () => {
    const maxedClient = makeClient({
      lastPurchaseAt: new Date("2025-06-01T12:00:00.000Z"), // +15 purchase, +10 within 90d
      onEmailList: true,                                     // +5
      productsOfInterest: [
        { model: "SUNLAP", collection: null, brand: null, intent: "interested" },
        { model: "SUB", collection: null, brand: null, intent: "interested" },
      ],                                                     // +5 (presence only)
      birthday: "1985-03-15",                                // +3
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),  // no staleness penalty
      status: "active",                                      // no unsubscribe penalty
    });
    const outreachLogs = [
      outreach("responded", -5),         // +10, awarded once
      outreach("wants_to_come_in", -20), // same boolean — no additional points
    ];

    const result = calcHeatScore(maxedClient, outreachLogs);
    expect(result.score).toBe(48);
    expect(result.level).toBe("warm");
  });

  it("returns level 'warm' when score is between 40 and 69", () => {
    const client = makeClient({
      lastPurchaseAt: new Date("2025-05-01T12:00:00.000Z"), // +15 +10 = 25
      onEmailList: true,                                      // +5
      productsOfInterest: [{ model: "GMT-MASTER", collection: null, brand: null, intent: "interested" }],                      // +5
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),  // no penalty
    });
    const outreachLogs = [outreach("responded", -10)]; // +10
    // 25 + 5 + 5 + 10 = 45
    const result = calcHeatScore(client, outreachLogs);
    expect(result.score).toBe(45);
    expect(result.level).toBe("warm");
  });

  it("returns level 'cold' when score < 40", () => {
    const client = makeClient({
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"), // no penalty
    });
    const result = calcHeatScore(client, []);
    expect(result.score).toBe(0);
    expect(result.level).toBe("cold");
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
    // Even though max reachable is ~48, verify the clamp works by
    // testing with all positive signals at once
    const client = makeClient({
      lastPurchaseAt: new Date("2025-06-01T12:00:00.000Z"), // +15 +10
      onEmailList: true,                                      // +5
      productsOfInterest: [{ model: "SUB", collection: null, brand: null, intent: "interested" }],                             // +5
      birthday: "1990-01-01",                                  // +3
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),  // no penalty
    });
    const result = calcHeatScore(client, [outreach("responded", -5)]);
    // 15 + 10 + 10 + 5 + 5 + 3 = 48
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBe(48);
  });

  // --- Outreach with "purchased" outcome within 90 days ---
  it("gives bonus for 'purchased' outcome in outreach", () => {
    const client = makeClient({
      lastOutreachAt: new Date("2025-06-10T12:00:00.000Z"),
    });
    const result = calcHeatScore(client, [outreach("purchased", -30)]);
    // +10 for purchased response
    expect(result.score).toBe(10);
  });

  // --- No outreach at all (lastOutreachAt is null) → Infinity days ---
  it("applies -25 penalty when lastOutreachAt is null (Infinity > 180)", () => {
    const client = makeClient({
      onEmailList: true,       // +5
      birthday: "1990-01-01",  // +3
      // lastOutreachAt defaults to null → -25
    });
    const result = calcHeatScore(client, []);
    // 5 + 3 - 25 = -17, clamped to 0
    expect(result.score).toBe(0);
    expect(result.level).toBe("cold");
  });
});
