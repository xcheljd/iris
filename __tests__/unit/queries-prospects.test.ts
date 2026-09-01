/**
 * Characterization tests for listProspects — the read layer the prospects page
 * renders through once filtering, sorting and paging moved into SQL.
 *
 * These pin what the client-side surface used to do: newest-first order per
 * status tab, search across name/phone/email, and the page maths (including
 * the clamp past the end). Every assertion narrows to fixtures inserted here —
 * the shared test DB carries seeded prospects, so absolute row counts are
 * never asserted except through the per-status `counts`, which are checked
 * against an oracle read straight from the table.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { prospects, rvxImportBatches } from "@/lib/db/schema";
import { inArray, sql } from "drizzle-orm";
import { listProspects, PROSPECT_SORT_KEYS, type ProspectStatus } from "@/lib/queries";

/** Unique enough that no seeded prospect can drift into a fixture assertion. */
const PREFIX = "ZZP";
const TEST_MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";

const DAY = 86_400_000;
const now = Date.now();

// createdAt descending is the native order, so these are listed oldest-last on
// purpose: `${PREFIX}-A` is the newest active prospect.
const FIXTURES = [
  { first: `${PREFIX}Ada`, last: "Zeller", phone: "5550001111", email: "ada@zzp.test", spend: 900, status: "active" as const, age: 0 },
  { first: `${PREFIX}Bo`, last: "Yates", phone: "5550002222", email: "bo@zzp.test", spend: null, status: "active" as const, age: 1 },
  { first: `${PREFIX}Cy`, last: "Xu", phone: null, email: null, spend: 250, status: "active" as const, age: 2 },
  { first: `${PREFIX}Dee`, last: "Wolf", phone: "5550004444", email: "dee@zzp.test", spend: 100, status: "graduated" as const, age: 3 },
  { first: `${PREFIX}Eli`, last: "Vance", phone: "5550005555", email: "eli@zzp.test", spend: 50, status: "rejected" as const, age: 4 },
];

let batchId: string;
const createdIds: string[] = [];

beforeAll(() => {
  batchId = randomUUID();
  db.insert(rvxImportBatches).values({
    id: batchId,
    reportStartDate: new Date(now - 30 * DAY),
    reportEndDate: new Date(now),
    totalRows: FIXTURES.length,
    importedCount: FIXTURES.length,
    importedBy: TEST_MANAGER_ID,
  }).run();

  for (const f of FIXTURES) {
    const id = randomUUID();
    db.insert(prospects).values({
      id,
      rvxCustomerId: `${PREFIX}-${f.first}`,
      rvxStoreId: "001",
      rvxSpend: f.spend,
      importBatchId: batchId,
      firstName: f.first,
      lastName: f.last,
      phone: f.phone,
      email: f.email,
      status: f.status,
      createdAt: new Date(now - f.age * DAY),
    }).run();
    createdIds.push(id);
  }
});

afterAll(() => {
  if (createdIds.length) db.delete(prospects).where(inArray(prospects.id, createdIds)).run();
  db.delete(rvxImportBatches).where(inArray(rvxImportBatches.id, [batchId])).run();
});

/** Just the fixture rows of a result, by first name. */
async function names(opts: Parameters<typeof listProspects>[0]) {
  const { rows } = await listProspects({ pageSize: 100, ...opts });
  return rows.filter((r) => r.firstName.startsWith(PREFIX)).map((r) => r.firstName);
}

describe("listProspects", () => {
  it("returns one status at a time, newest first", async () => {
    expect(await names({ status: "active" })).toEqual([`${PREFIX}Ada`, `${PREFIX}Bo`, `${PREFIX}Cy`]);
    expect(await names({ status: "graduated" })).toEqual([`${PREFIX}Dee`]);
    expect(await names({ status: "rejected" })).toEqual([`${PREFIX}Eli`]);
    expect(await names({ status: "unsubscribed" })).toEqual([]);
  });

  it("searches across first name, last name, phone and email", async () => {
    expect(await names({ q: "Zeller" })).toEqual([`${PREFIX}Ada`]);
    expect(await names({ q: "5550002222" })).toEqual([`${PREFIX}Bo`]);
    expect(await names({ q: "bo@zzp" })).toEqual([`${PREFIX}Bo`]);
    // Case-insensitive, the way the old `.toLowerCase().includes()` filter was.
    expect(await names({ q: PREFIX.toLowerCase() })).toEqual([`${PREFIX}Ada`, `${PREFIX}Bo`, `${PREFIX}Cy`]);
    // A NULL column never matches, the way `?.includes()` never did.
    expect(await names({ q: "5550" })).toEqual([`${PREFIX}Ada`, `${PREFIX}Bo`]);
  });

  it("escapes LIKE metacharacters in the search term", async () => {
    expect(await names({ q: "%" })).toEqual([]);
    expect(await names({ q: "_" })).toEqual([]);
  });

  it("sorts on every whitelisted key, ascending first", async () => {
    expect(PROSPECT_SORT_KEYS).toEqual(["name", "phone", "email", "spend", "added"]);

    expect(await names({ status: "active", q: PREFIX, sort: "name" })).toEqual([
      `${PREFIX}Ada`, `${PREFIX}Bo`, `${PREFIX}Cy`,
    ]);
    expect(await names({ status: "active", q: PREFIX, sort: "name", sortDir: "desc" })).toEqual([
      `${PREFIX}Cy`, `${PREFIX}Bo`, `${PREFIX}Ada`,
    ]);

    // NULL spend keeps SQLite's placement: first ascending, last descending.
    expect(await names({ status: "active", sort: "spend" })).toEqual([
      `${PREFIX}Bo`, `${PREFIX}Cy`, `${PREFIX}Ada`,
    ]);
    expect(await names({ status: "active", sort: "spend", sortDir: "desc" })).toEqual([
      `${PREFIX}Ada`, `${PREFIX}Cy`, `${PREFIX}Bo`,
    ]);

    expect(await names({ status: "active", sort: "added" })).toEqual([
      `${PREFIX}Cy`, `${PREFIX}Bo`, `${PREFIX}Ada`,
    ]);
  });

  it("pages, and clamps a page past the end to the last real one", async () => {
    const page1 = await listProspects({ status: "active", q: PREFIX, pageSize: 2 });
    expect(page1.rows.map((r) => r.firstName)).toEqual([`${PREFIX}Ada`, `${PREFIX}Bo`]);
    expect(page1.total).toBe(3);
    expect(page1.page).toBe(1);

    const page2 = await listProspects({ status: "active", q: PREFIX, pageSize: 2, page: 2 });
    expect(page2.rows.map((r) => r.firstName)).toEqual([`${PREFIX}Cy`]);

    const past = await listProspects({ status: "active", q: PREFIX, pageSize: 2, page: 99 });
    expect(past.page).toBe(2);
    expect(past.rows.map((r) => r.firstName)).toEqual([`${PREFIX}Cy`]);
  });

  it("counts every status off the whole table, not the filtered page", async () => {
    const oracle = db
      .select({ status: prospects.status, n: sql<number>`count(*)` })
      .from(prospects)
      .groupBy(prospects.status)
      .all();
    const expected: Record<ProspectStatus, number> = { active: 0, graduated: 0, unsubscribed: 0, rejected: 0 };
    for (const row of oracle) expected[row.status] = Number(row.n);

    // A search that leaves one row still reports the full per-status counts.
    const narrowed = await listProspects({ status: "active", q: `${PREFIX}Ada` });
    expect(narrowed.total).toBe(1);
    expect(narrowed.counts).toEqual(expected);
  });
});
