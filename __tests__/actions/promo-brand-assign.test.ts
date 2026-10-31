import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { modelCatalog, promoItems, promoMatches } from "@/lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { randomUUID } from "crypto";
import { importPromos, resolvePromoRows } from "@/lib/actions";

const managerSession: Session = {
  user: { id: "2d7a352d-53a0-4544-b515-902e7dd59206", name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};
const T = randomUUID().slice(0, 6).toUpperCase();
const M = (n: number) => `PBA${T}-${n}`;
const COLL = `PBACOLL${T}`;

describe("promo import brand assignment", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as never);
    // A catalog model that files COLL under Vellamy, for the collection hint.
    db.insert(modelCatalog).values({ model: M(0), collection: COLL, source: "curated", brand: "Vellamy" }).run();
  });
  afterEach(() => {
    const ids = db.select({ id: promoItems.id }).from(promoItems).where(like(promoItems.modelNumber, `PBA${T}-%`)).all().map((r) => r.id);
    if (ids.length) {
      db.delete(promoMatches).where(inArray(promoMatches.promoId, ids)).run();
      db.delete(promoItems).where(inArray(promoItems.id, ids)).run();
    }
    db.delete(modelCatalog).where(like(modelCatalog.model, `PBA${T}-%`)).run();
  });

  it("suggests per row and flags a sheet brand that disagrees with the catalog", async () => {
    const res = await resolvePromoRows([
      { modelNumber: M(1), collection: COLL },
      { modelNumber: M(2), collection: "UNKNOWN", brandText: "Aldremoor" },
      { modelNumber: M(3), collection: COLL, sourceSheet: "Aldermoor" },
      { modelNumber: M(0), collection: COLL, brandText: "Maravista" },
    ]);
    if ("error" in res) throw new Error(res.error);
    const by = new Map(res.resolved.map((r) => [r.modelNumber, r]));
    expect(by.get(M(1))!.suggestion).toMatchObject({ brand: "Vellamy", source: "collection" });
    expect(by.get(M(2))!.suggestion).toMatchObject({ brand: "Aldermoor", source: "sheet-typo" });
    expect(by.get(M(3))!.suggestion).toMatchObject({ brand: null, conflict: ["Vellamy", "Aldermoor"] });
    expect(by.get(M(0))!).toMatchObject({ catalogBrand: "Vellamy", sheetBrandMismatch: "Maravista" });
  });

  it("saves assigned brands to the catalog, marking kept suggestions for review", async () => {
    const res = await importPromos([
      { modelNumber: M(1), collection: COLL, brand: "Vellamy", brandSuggested: true },
      { modelNumber: M(2), collection: COLL, brand: "Aldermoor", brandSuggested: false },
      { modelNumber: M(3), collection: COLL, brand: null },
    ], null, null, { saveBrandsToCatalog: true });
    expect(res).toMatchObject({ imported: 3, brandsSaved: 2 });
    const cat = (m: string) => db.select().from(modelCatalog).where(eq(modelCatalog.model, m)).get();
    expect(cat(M(1))).toMatchObject({ brand: "Vellamy", needsReview: true });
    expect(cat(M(2))).toMatchObject({ brand: "Aldermoor", needsReview: false });
    expect(cat(M(3))?.brand ?? null).toBeNull();
  });

  it("leaves the catalog alone when saving is off, and never overwrites a catalog brand", async () => {
    await importPromos([{ modelNumber: M(1), collection: COLL, brand: "Aldermoor" }], null, null, { saveBrandsToCatalog: false });
    expect(db.select().from(modelCatalog).where(eq(modelCatalog.model, M(1))).get()?.brand ?? null).toBeNull();
    const res = await importPromos([{ modelNumber: M(0), collection: COLL, brand: "Aldermoor" }], null, null, { saveBrandsToCatalog: true });
    expect(res).toMatchObject({ brandsSaved: 0 });
    expect(db.select().from(modelCatalog).where(eq(modelCatalog.model, M(0))).get()?.brand).toBe("Vellamy");
  });
});
