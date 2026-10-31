import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/_shared", async (orig) => ({
  ...(await orig<typeof import("@/lib/actions/_shared")>()),
  isSessionEmployeeStale: vi.fn().mockResolvedValue(false),
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { clients, modelCatalog, activityEvents, promoMatches } from "@/lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { randomUUID } from "crypto";
import { updateCatalogRows } from "@/lib/actions";

const managerSession: Session = {
  user: { id: "2d7a352d-53a0-4544-b515-902e7dd59206", name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};
const T = randomUUID().slice(0, 6).toUpperCase();
const M = (n: number) => `CBE${T}-${n}`;
const cat = (m: string) => db.select().from(modelCatalog).where(eq(modelCatalog.model, m)).get();

describe("updateCatalogRows", () => {
  const clientIds: string[] = [];
  beforeEach(() => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as never);
    db.insert(modelCatalog).values([
      { model: M(1), collection: "OLD", source: "promo", brand: null, needsReview: true },
      { model: M(2), collection: "OLD", source: "curated", brand: "Vellamy", msrp: 100 },
    ]).run();
  });
  afterEach(() => {
    if (clientIds.length) {
      db.delete(activityEvents).where(inArray(activityEvents.clientId, clientIds)).run();
      db.delete(promoMatches).where(inArray(promoMatches.clientId, clientIds)).run();
      db.delete(clients).where(inArray(clients.id, clientIds)).run();
    }
    db.delete(modelCatalog).where(like(modelCatalog.model, `CBE${T}-%`)).run();
  });

  it("sets one brand on a selection, fixing capitals and marking them reviewed", async () => {
    expect(await updateCatalogRows([M(1), M(2).toLowerCase()], { brand: "aldermoor" })).toEqual({ updated: 2, affected: 0 });
    expect(cat(M(1))).toMatchObject({ brand: "Aldermoor", needsReview: false });
    expect(cat(M(2))).toMatchObject({ brand: "Aldermoor" });
  });

  it("clears or sets the MSRP", async () => {
    await updateCatalogRows([M(1)], { msrp: 1295.499 });
    expect(cat(M(1))?.msrp).toBe(1295.5);
    await updateCatalogRows([M(2)], { msrp: null });
    expect(cat(M(2))?.msrp ?? null).toBeNull();
  });

  it("changes the collection and cascades it to clients' interests", async () => {
    const id = randomUUID(); clientIds.push(id);
    db.insert(clients).values({ id, firstName: "Cat", lastName: "Edit", productsOfInterest: [{ model: M(1), collection: "OLD", brand: null, intent: "interested" }] }).run();
    const res = await updateCatalogRows([M(1)], { collection: "NEWCOLL", brand: "Vellamy" });
    expect(res).toEqual({ updated: 1, affected: 1 });
    expect(cat(M(1))).toMatchObject({ collection: "NEWCOLL", brand: "Vellamy", source: "curated" });
    expect(db.select().from(clients).where(eq(clients.id, id)).get()?.productsOfInterest[0].collection).toBe("NEWCOLL");
  });

  it("refuses unlisted brands, blank collections, bad MSRPs and empty changes", async () => {
    expect(await updateCatalogRows([M(1)], { brand: "Nonesuch" })).toEqual({ error: "\"Nonesuch\" isn't in the brand list (Settings → Brands)" });
    expect(await updateCatalogRows([M(1)], { collection: "  " })).toEqual({ error: "Collection can't be blank" });
    expect(await updateCatalogRows([M(1)], { msrp: -5 })).toEqual({ error: "MSRP must be a positive amount" });
    expect(await updateCatalogRows([M(1)], {})).toEqual({ error: "Nothing to change" });
    expect(await updateCatalogRows([], { brand: "Vellamy" })).toEqual({ error: "No models selected" });
  });
});
