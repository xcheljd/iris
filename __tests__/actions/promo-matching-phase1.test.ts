// One check per matching bug found by running real workflows: matches follow
// every change to a client, purchases answer a promo, ended promos are
// history, each client is listed once per item, and nobody who can't be
// contacted is listed.
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { clients, promoItems, promoMatches, prospects, importBatches, outreachLogs, activityEvents, unsubscribeList, bannedCustomers, modelCatalog } from "@/lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  importPromos, createPromo, clearAllPromos, saveClientEdits, logOutreach, graduateProspect,
  mergeClients, unsubscribeClient, resubscribeClient, banClient,
} from "@/lib/actions";
import { POST } from "@/app/api/clients/route";
import { getMatchedClients, getPromoMatchCounts, currentPromoPeriod } from "@/lib/queries";
import { rematchClientPromos } from "@/lib/promo-match";
import { addDays, format } from "date-fns";

const S: Session = {
  user: { id: "2d7a352d-53a0-4544-b515-902e7dd59206", name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};
const day = (n: number) => format(addDays(new Date(), n), "yyyy-MM-dd");
const T = randomUUID().slice(0, 5).toUpperCase();
const MOD = `PM1${T}-1`;
const COLL = `PMONECOLL${T}`;
const ids: string[] = [];
const interest = (model: string | null, collection: string | null = null) => [{ model, collection, brand: null, intent: "interested" as const }];
const mk = (extra: Partial<typeof clients.$inferInsert> = {}) => {
  const id = randomUUID(); ids.push(id);
  db.insert(clients).values({ id, firstName: `Pm1${T}`, lastName: "X", preferredContact: "call", productsOfInterest: [], employeeId: S.user.id, ...extra }).run();
  return id;
};
const matches = (cid: string) => db.select().from(promoMatches).where(eq(promoMatches.clientId, cid)).all();
const listed = async (cid: string) => (await getMatchedClients()).filter((r) => r.clientId === cid);
const thisWeek = () => importPromos([{ modelNumber: MOD, collection: COLL, brand: "Aldermoor", discountPercent: 20 }], day(-2), day(4));

beforeEach(() => vi.mocked(getServerSession).mockResolvedValue(S as never));
afterEach(() => {
  const pids = db.select({ id: promoItems.id }).from(promoItems).where(like(promoItems.modelNumber, `PM1${T}%`)).all().map((p) => p.id);
  if (pids.length) db.delete(promoMatches).where(inArray(promoMatches.promoId, pids)).run();
  db.delete(promoMatches).where(inArray(promoMatches.clientId, ids)).run();
  if (pids.length) db.delete(promoItems).where(inArray(promoItems.id, pids)).run();
  db.delete(outreachLogs).where(inArray(outreachLogs.clientId, ids)).run();
  db.delete(activityEvents).where(inArray(activityEvents.clientId, ids)).run();
  db.delete(bannedCustomers).where(inArray(bannedCustomers.customerId, ids)).run();
  db.delete(unsubscribeList).where(like(unsubscribeList.email, `pm1${T.toLowerCase()}%`)).run();
  db.delete(prospects).where(like(prospects.firstName, `Pm1${T}%`)).run();
  db.delete(clients).where(inArray(clients.id, ids)).run();
  db.delete(modelCatalog).where(like(modelCatalog.model, `PM1${T}%`)).run();
  ids.length = 0;
});

describe("matches follow the client", () => {
  it("editing a client's interests matches this week's promo, and removing them unmatches", async () => {
    await thisWeek();
    const a = mk();
    await saveClientEdits(a, { productsOfInterest: interest(MOD) });
    expect(matches(a)).toHaveLength(1);
    await saveClientEdits(a, { productsOfInterest: [] });
    expect(matches(a)).toHaveLength(0);
  });

  it("a new client is matched as soon as they're added", async () => {
    await thisWeek();
    const res = await POST(new Request("http://x/api/clients", { method: "POST", body: JSON.stringify({
      firstName: `Pm1${T}`, lastName: "New", phone: `8${Date.now()}`.slice(0, 10), preferredContact: "call", productsOfInterest: interest(MOD),
    }) }));
    const body = await res.json();
    ids.push(body.id);
    expect(matches(body.id)).toHaveLength(1);
  });

  it("a prospect turned client is matched", async () => {
    await thisWeek();
    const bid = randomUUID();
    db.insert(importBatches).values({ id: bid, totalRows: 1, importedCount: 1, importedBy: S.user.id }).run();
    const pid = randomUUID();
    db.insert(prospects).values({ id: pid, importCustomerId: `CUST-PM1${T}`, importBatchId: bid, firstName: `Pm1${T}P`, lastName: "G", productsOfInterest: [], status: "active" }).run();
    const g = await graduateProspect({ prospectId: pid, firstName: `Pm1${T}P`, lastName: "G", preferredContact: "call", productsOfInterest: interest(MOD) });
    if (g.type !== "created") throw new Error(JSON.stringify(g));
    ids.push(g.clientId);
    expect(matches(g.clientId)).toHaveLength(1);
  });

  it("merging keeps the winner matched from the loser's interests", async () => {
    await thisWeek();
    const win = mk({ dateAdded: new Date("2019-01-01") });
    const lose = mk({ productsOfInterest: interest(null, COLL) });
    db.transaction((tx) => rematchClientPromos(tx, [lose]));
    const r = await mergeClients(win, lose, {}, null);
    expect(r).toEqual({ winnerId: win });
    ids.splice(ids.indexOf(lose), 1);
    expect(matches(win).map((m) => m.matchType)).toEqual(["collection"]);
  });

  it("re-checking keeps an existing match as it was", async () => {
    await thisWeek();
    const a = mk({ productsOfInterest: interest(MOD) });
    db.transaction((tx) => rematchClientPromos(tx, [a]));
    const [before] = matches(a);
    await saveClientEdits(a, { productsOfInterest: [...interest(MOD), ...interest(`PM1${T}-OTHER`)] });
    expect(matches(a).map((m) => [m.id, m.createdAt?.getTime()])).toEqual([[before.id, before.createdAt?.getTime()]]);
  });
});

describe("purchases", () => {
  it("buying the item drops the buyer's match instead of creating one", async () => {
    const buyer = mk({ productsOfInterest: interest(MOD) });
    await thisWeek();
    expect(matches(buyer)).toHaveLength(1);
    await logOutreach({ clientId: buyer, method: "in-person", outcome: "purchased", purchasedModel: MOD.toLowerCase() });
    expect(matches(buyer)).toHaveLength(0);
    const stranger = mk();
    await logOutreach({ clientId: stranger, method: "in-person", outcome: "purchased", purchasedModel: MOD });
    expect(matches(stranger)).toHaveLength(0);
  });

  it("a banned client stays off the list after a purchase is logged", async () => {
    const b = mk({ productsOfInterest: interest(MOD), phone: "7025550101" });
    await thisWeek();
    await banClient(b, "Other", "test");
    await logOutreach({ clientId: b, method: "in-person", outcome: "purchased", purchasedModel: MOD });
    expect(matches(b)).toHaveLength(0);
  });
});

describe("ended and upcoming promos", () => {
  it("an ended promo matches nobody and isn't listed", async () => {
    const a = mk({ productsOfInterest: interest(MOD) });
    await importPromos([{ modelNumber: MOD, collection: COLL, brand: "Aldermoor" }], day(-20), day(-14));
    expect(matches(a)).toHaveLength(0);
    // An old match (from before this rule) stays as history but isn't listed or counted.
    const [old] = db.select().from(promoItems).where(eq(promoItems.modelNumber, MOD)).all();
    db.insert(promoMatches).values({ id: randomUUID(), clientId: a, promoId: old.id, matchType: "model" }).run();
    expect(await listed(a)).toEqual([]);
    expect((await getPromoMatchCounts([old.id]))[old.id] ?? 0).toBe(0);
    // Re-checking the client doesn't touch it, and doesn't add any new ones.
    db.transaction((tx) => rematchClientPromos(tx, [a]));
    expect(matches(a)).toHaveLength(1);
  });

  it("a promo that hasn't started is matched and listed with its start date", async () => {
    const a = mk({ productsOfInterest: interest(MOD) });
    await importPromos([{ modelNumber: MOD, collection: COLL, brand: "Aldermoor" }], day(3), day(9));
    expect((await listed(a)).map((r) => r.promoStart)).toEqual([day(3)]);
  });

  it("clearing all promos still clears their matches", async () => {
    const a = mk({ productsOfInterest: interest(MOD) });
    await thisWeek();
    await clearAllPromos();
    expect(matches(a)).toHaveLength(0);
  });
});

describe("one row per client per item", () => {
  it("two running promos on one item list the client once, under the bigger discount", async () => {
    const a = mk({ productsOfInterest: interest(MOD) });
    await importPromos([{ modelNumber: MOD, collection: COLL, brand: "Aldermoor", msrp: 500, discountPercent: 20 }], day(-2), day(4));
    await importPromos([{ modelNumber: MOD, collection: COLL, brand: "Aldermoor", msrp: 500, discountPrice: 350 }], day(-1), day(10));
    expect(matches(a)).toHaveLength(2);
    const rows = await listed(a);
    expect(rows.map((r) => r.discountPrice)).toEqual([350]);
    const counts = await getPromoMatchCounts();
    const pids = db.select().from(promoItems).where(eq(promoItems.modelNumber, MOD)).all();
    expect(pids.map((p) => counts[p.id] ?? 0).sort()).toEqual([0, 1]);
  });
});

describe("who can be listed", () => {
  it("unsubscribing drops matches, even without an email; resubscribing brings them back", async () => {
    const a = mk({ productsOfInterest: interest(MOD), phone: "7025550102" });
    await thisWeek();
    await unsubscribeClient(a);
    expect(matches(a)).toHaveLength(0);
    // A status set some other way is still kept off the list.
    const b = mk({ productsOfInterest: interest(MOD), status: "unsubscribed" });
    db.insert(promoMatches).values({ id: randomUUID(), clientId: b, promoId: db.select().from(promoItems).where(eq(promoItems.modelNumber, MOD)).get()!.id, matchType: "model" }).run();
    expect(await listed(b)).toEqual([]);
    await resubscribeClient(a);
    expect(matches(a)).toHaveLength(1);
  });
});

describe("hand-added promos", () => {
  it("join the current promo, and need dates when none is running", async () => {
    await clearAllPromos();
    expect(currentPromoPeriod()).toBeNull();
    expect(await createPromo(`PM1${T}-H1`, COLL, "Aldermoor")).toEqual({ error: "No promo is running — pick the promo dates" });
    await thisWeek();
    expect(currentPromoPeriod()).toEqual({ promoStart: day(-2), promoEnd: day(4) });
    expect(await createPromo(`PM1${T}-H1`, COLL, "Aldermoor")).toBeUndefined();
    const added = db.select().from(promoItems).where(eq(promoItems.modelNumber, `PM1${T}-H1`)).get();
    expect([added?.promoStart, added?.promoEnd]).toEqual([day(-2), day(4)]);
    expect(await createPromo(`PM1${T}-H2`, COLL, "Aldermoor", null, null, null, { promoStart: day(5), promoEnd: day(1) }))
      .toEqual({ error: "Promo start must be on or before promo end" });
  });
});
