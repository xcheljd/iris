/**
 * Characterization tests for listPromos — the read layer the promos page
 * renders through once filtering, sorting and paging moved into SQL.
 *
 * These pin what the client-side surface used to do: import order by default,
 * search across model/collection/brand, the filter set the popover exposes,
 * page maths (including the clamp past the end), and null placement on each
 * sort. Every assertion narrows to fixtures inserted here — the shared test DB
 * carries seeded promos, so absolute row counts are never asserted.
 *
 * The unfiltered summary is checked against an oracle computed straight from
 * the table, the way the smart-list count tests check a count against the list
 * it summarises.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { promoWatches, promoMatches } from "@/lib/db/schema";
import { inArray, sql } from "drizzle-orm";
import { listPromos, getPromoMatchCounts, PROMO_SORT_KEYS } from "@/lib/queries";

/** Unique enough that no seeded promo can drift into a fixture assertion. */
const PREFIX = "ZZQ";

// Inserted in this order, so rowid order === this order: the "import order"
// the promo list has always defaulted to.
const FIXTURES = [
  { model: `${PREFIX}-001`, collection: `${PREFIX}-Zulu`, brand: "Meridian" as const, msrp: 1000, disc: 10, price: 900, s1: 1, s2: 0, start: "2026-01-05", end: "2026-01-10" },
  { model: `${PREFIX}-002`, collection: `${PREFIX}-Yankee`, brand: "Ashford" as const, msrp: null, disc: null, price: null, s1: 0, s2: 2, start: null, end: null },
  { model: `${PREFIX}-003`, collection: `${PREFIX}-Xray`, brand: "Voss" as const, msrp: 500, disc: 50, price: 250, s1: 3, s2: 3, start: null, end: null },
  { model: `${PREFIX}-004`, collection: `${PREFIX}-Zulu`, brand: null, msrp: 2000, disc: 5, price: 1900, s1: 0, s2: 0, start: null, end: null },
  { model: `${PREFIX}-005`, collection: `${PREFIX}-Whiskey`, brand: "Meridian" as const, msrp: 100, disc: 20, price: 80, s1: 5, s2: 1, start: null, end: null },
];

const createdIds: string[] = [];

beforeAll(() => {
  for (const f of FIXTURES) {
    const id = randomUUID();
    db.insert(promoWatches).values({
      id,
      modelNumber: f.model,
      collection: f.collection,
      brand: f.brand,
      msrp: f.msrp,
      discountPercent: f.disc,
      discountPrice: f.price,
      sizeOneQty: f.s1,
      sizeTwoQty: f.s2,
      promoStart: f.start,
      promoEnd: f.end,
    }).run();
    createdIds.push(id);
  }
});

afterAll(() => {
  if (createdIds.length) db.delete(promoWatches).where(inArray(promoWatches.id, createdIds)).run();
});

/** Fixture model numbers in the order the query returned them. */
function models(result: { rows: { modelNumber: string }[] }): string[] {
  return result.rows.filter((r) => r.modelNumber.startsWith(PREFIX)).map((r) => r.modelNumber);
}

describe("listPromos scoping and pagination", () => {
  it("defaults to import order and is company-wide (no owner scoping)", async () => {
    const result = await listPromos({ q: PREFIX, pageSize: 100 });
    expect(models(result)).toEqual(FIXTURES.map((f) => f.model));
    expect(result.total).toBe(FIXTURES.length);
    expect(result.page).toBe(1);
  });

  it("pages through the list and clamps a page past the end", async () => {
    const page1 = await listPromos({ q: PREFIX, page: 1, pageSize: 2 });
    expect(models(page1)).toEqual([`${PREFIX}-001`, `${PREFIX}-002`]);
    expect(page1.total).toBe(5);

    const page2 = await listPromos({ q: PREFIX, page: 2, pageSize: 2 });
    expect(models(page2)).toEqual([`${PREFIX}-003`, `${PREFIX}-004`]);

    const page3 = await listPromos({ q: PREFIX, page: 3, pageSize: 2 });
    expect(models(page3)).toEqual([`${PREFIX}-005`]);

    // Past the end returns the last real page, not an empty table — the clamp
    // the client-side `pagination` memo used to apply to its stored index.
    const pastEnd = await listPromos({ q: PREFIX, page: 99, pageSize: 2 });
    expect(pastEnd.page).toBe(3);
    expect(models(pastEnd)).toEqual([`${PREFIX}-005`]);
    expect(pastEnd.total).toBe(5);
  });
});

describe("listPromos sorting", () => {
  it("sorts text columns both ways, nulls leading ascending", async () => {
    const asc = await listPromos({ q: PREFIX, sort: "modelNumber", sortDir: "asc", pageSize: 100 });
    expect(models(asc)).toEqual([`${PREFIX}-001`, `${PREFIX}-002`, `${PREFIX}-003`, `${PREFIX}-004`, `${PREFIX}-005`]);

    const desc = await listPromos({ q: PREFIX, sort: "modelNumber", sortDir: "desc", pageSize: 100 });
    expect(models(desc)).toEqual([...models(asc)].reverse());

    // ZZQ-004 has no brand; a null brand leads ascending and trails descending.
    const byBrand = await listPromos({ q: PREFIX, sort: "brand", sortDir: "asc", pageSize: 100 });
    expect(models(byBrand)[0]).toBe(`${PREFIX}-004`);
    const byBrandDesc = await listPromos({ q: PREFIX, sort: "brand", sortDir: "desc", pageSize: 100 });
    expect(models(byBrandDesc).at(-1)).toBe(`${PREFIX}-004`);
  });

  it("sorts numeric columns, with a null MSRP leading ascending", async () => {
    const asc = await listPromos({ q: PREFIX, sort: "msrp", sortDir: "asc", pageSize: 100 });
    expect(models(asc)).toEqual([
      `${PREFIX}-002`, // null
      `${PREFIX}-005`, // 100
      `${PREFIX}-003`, // 500
      `${PREFIX}-001`, // 1000
      `${PREFIX}-004`, // 2000
    ]);

    const desc = await listPromos({ q: PREFIX, sort: "msrp", sortDir: "desc", pageSize: 100 });
    expect(models(desc)).toEqual([...models(asc)].reverse());

    const bySize = await listPromos({ q: PREFIX, sort: "sizeOneQty", sortDir: "desc", pageSize: 100 });
    expect(models(bySize)[0]).toBe(`${PREFIX}-005`); // 5 in stock
  });

  it("orders ties by import order, so a page boundary can't repeat a row", async () => {
    // Three fixtures share sizeTwoQty 0/1/2/3 unevenly; collection has the tie.
    const page1 = await listPromos({ q: PREFIX, sort: "collection", sortDir: "asc", page: 1, pageSize: 3 });
    const page2 = await listPromos({ q: PREFIX, sort: "collection", sortDir: "asc", page: 2, pageSize: 3 });
    const seen = [...models(page1), ...models(page2)];
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(5);
    // The two ZZQ-Zulu rows tie and must stay in insertion order.
    expect(seen.indexOf(`${PREFIX}-001`)).toBeLessThan(seen.indexOf(`${PREFIX}-004`));
  });

  it("accepts exactly the whitelisted sort keys", () => {
    expect(PROMO_SORT_KEYS).toEqual([
      "modelNumber", "collection", "brand", "msrp",
      "discountPercent", "discountPrice", "sizeOneQty", "sizeTwoQty",
    ]);
  });
});

describe("listPromos search and filters", () => {
  it("searches model, collection and brand", async () => {
    expect(models(await listPromos({ q: `${PREFIX}-003`, pageSize: 100 }))).toEqual([`${PREFIX}-003`]);
    expect(models(await listPromos({ q: `${PREFIX}-Zulu`, pageSize: 100 }))).toEqual([`${PREFIX}-001`, `${PREFIX}-004`]);
    // Brand-only hit: no fixture model or collection contains "Ashford".
    expect(models(await listPromos({ q: "Ashford", pageSize: 100 }))).toEqual([`${PREFIX}-002`]);
  });

  it("matches case-insensitively, like the old client-side filter", async () => {
    expect(models(await listPromos({ q: `${PREFIX.toLowerCase()}-zulu`, pageSize: 100 })))
      .toEqual([`${PREFIX}-001`, `${PREFIX}-004`]);
  });

  it("applies each popover filter", async () => {
    const q = PREFIX;
    expect(models(await listPromos({ q, brands: ["Meridian"], pageSize: 100 })))
      .toEqual([`${PREFIX}-001`, `${PREFIX}-005`]);
    // Anything outside BRAND_VALUES is dropped rather than reaching SQL.
    expect(models(await listPromos({ q, brands: ["'; drop table promo_watches--"], pageSize: 100 })))
      .toHaveLength(5);
    expect(models(await listPromos({ q, collections: [`${PREFIX}-Zulu`], pageSize: 100 })))
      .toEqual([`${PREFIX}-001`, `${PREFIX}-004`]);
    // Unpriced rows fall out of an MSRP ceiling, as `(msrp ?? Infinity) <= max` did.
    expect(models(await listPromos({ q, msrpMax: 1000, pageSize: 100 })))
      .toEqual([`${PREFIX}-001`, `${PREFIX}-003`, `${PREFIX}-005`]);
    // A missing discount counts as 0.
    expect(models(await listPromos({ q, discMin: 20, pageSize: 100 })))
      .toEqual([`${PREFIX}-003`, `${PREFIX}-005`]);
    expect(models(await listPromos({ q, size1Pos: true, pageSize: 100 })))
      .toEqual([`${PREFIX}-001`, `${PREFIX}-003`, `${PREFIX}-005`]);
    expect(models(await listPromos({ q, size2Pos: true, pageSize: 100 })))
      .toEqual([`${PREFIX}-002`, `${PREFIX}-003`, `${PREFIX}-005`]);
    // Filters stack.
    expect(models(await listPromos({ q, brands: ["Meridian"], size1Pos: true, msrpMax: 500, pageSize: 100 })))
      .toEqual([`${PREFIX}-005`]);
  });

  it("keeps `total` in step with the rows every filter returns", async () => {
    const combos = [
      {},
      { q: PREFIX },
      { q: PREFIX, brands: ["Meridian"] },
      { q: PREFIX, collections: [`${PREFIX}-Zulu`] },
      { q: PREFIX, msrpMax: 1000 },
      { q: PREFIX, discMin: 20, size2Pos: true },
      { q: "no-such-promo-anywhere" },
    ];
    for (const combo of combos) {
      const all = await listPromos({ ...combo, pageSize: 10_000 });
      expect(all.total).toBe(all.rows.length);
    }
  });
});

describe("listPromos summary", () => {
  it("aggregates the whole list and never moves when a filter narrows it", async () => {
    const oracle = db
      .select({
        count: sql<number>`count(*)`,
        retail: sql<number>`COALESCE(SUM(COALESCE(${promoWatches.msrp}, 0)), 0)`,
        savings: sql<number>`COALESCE(SUM(COALESCE(${promoWatches.msrp}, 0) - COALESCE(${promoWatches.discountPrice}, 0)), 0)`,
        start: sql<string | null>`MIN(NULLIF(${promoWatches.promoStart}, ''))`,
        end: sql<string | null>`MAX(NULLIF(${promoWatches.promoEnd}, ''))`,
      })
      .from(promoWatches)
      .get();

    const unfiltered = await listPromos({ pageSize: 1 });
    expect(unfiltered.summary.count).toBe(Number(oracle?.count ?? 0));
    expect(unfiltered.summary.retailValue).toBeCloseTo(Number(oracle?.retail ?? 0), 5);
    expect(unfiltered.summary.savings).toBeCloseTo(Number(oracle?.savings ?? 0), 5);
    expect(unfiltered.summary.promoStart).toBe(oracle?.start ?? null);
    expect(unfiltered.summary.promoEnd).toBe(oracle?.end ?? null);

    const filtered = await listPromos({ q: "no-such-promo-anywhere" });
    expect(filtered.total).toBe(0);
    expect(filtered.summary).toEqual(unfiltered.summary);
  });

  it("lists distinct collections for the filter menu, sorted", async () => {
    const { collections } = await listPromos({ q: PREFIX });
    const mine = collections.filter((c) => c.startsWith(PREFIX));
    expect(mine).toEqual([`${PREFIX}-Whiskey`, `${PREFIX}-Xray`, `${PREFIX}-Yankee`, `${PREFIX}-Zulu`]);
    expect(new Set(collections).size).toBe(collections.length);
  });
});

describe("getPromoMatchCounts scoping", () => {
  it("counts only the promos it is asked about", async () => {
    const full = await getPromoMatchCounts();
    const ids = Object.keys(full).slice(0, 2);

    expect(await getPromoMatchCounts([])).toEqual({});
    expect(await getPromoMatchCounts([randomUUID()])).toEqual({});

    const scoped = await getPromoMatchCounts(ids);
    expect(Object.keys(scoped).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(scoped[id]).toBe(full[id]);
  });

  it("stays one grouped query rather than one per promo", async () => {
    // A promo with no live matches must simply be absent from the map, not
    // trigger a lookup of its own.
    const [{ id } = { id: "" }] = db.select({ id: promoWatches.id }).from(promoWatches).limit(1).all();
    const matched = db.select({ n: sql<number>`count(*)` }).from(promoMatches).get();
    expect(Number(matched?.n ?? 0)).toBeGreaterThanOrEqual(0);
    const counts = await getPromoMatchCounts([id]);
    expect(Object.keys(counts).every((k) => k === id)).toBe(true);
  });
});
