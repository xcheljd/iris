import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { brands, modelCatalog, promoItems, promoMatches } from "@/lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { randomUUID } from "crypto";
import { analyzeCatalogImport, importCatalog, importPromos, resolvePromoRows } from "@/lib/actions";
import { getBrandNames } from "@/lib/brands";

const managerSession: Session = {
  user: { id: "2d7a352d-53a0-4544-b515-902e7dd59206", name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};
const T = randomUUID().slice(0, 6).toUpperCase();
const NEW = `Zephyr${T}`;
const TYPO = `Zephry${T}`;
const M = (n: number) => `IAB${T}-${n}`;

describe("imports add new brands", () => {
  beforeEach(() => vi.mocked(getServerSession).mockResolvedValue(managerSession as never));
  afterEach(() => {
    const ids = db.select({ id: promoItems.id }).from(promoItems).where(like(promoItems.modelNumber, `IAB${T}-%`)).all().map((r) => r.id);
    if (ids.length) {
      db.delete(promoMatches).where(inArray(promoMatches.promoId, ids)).run();
      db.delete(promoItems).where(inArray(promoItems.id, ids)).run();
    }
    db.delete(modelCatalog).where(like(modelCatalog.model, `IAB${T}-%`)).run();
    db.delete(brands).where(inArray(brands.name, [NEW, TYPO])).run();
  });

  const file = ["Brand,Collection,Model,MSRP", `${NEW},C${T},${M(1)},100`, `${NEW},C${T},${M(2)},100`, `${TYPO},C${T},${M(3)},100`].join("\n");

  it("catalog analyze lists the file's new brands and previews with the ticked ones", async () => {
    const a = await analyzeCatalogImport(file);
    if ("error" in a) throw new Error(a.error);
    expect(a.newBrands).toEqual([{ name: NEW, rows: 2, closeTo: null }, { name: TYPO, rows: 1, closeTo: NEW }]);
    expect(a.brandRows).toHaveLength(3);
    const b = await analyzeCatalogImport(file, { extraBrands: [NEW] });
    if ("error" in b) throw new Error(b.error);
    // M1/M2 now carry the brand; the typo row is offered it as a suggestion.
    expect(b.brandRows.map((r) => [r.model, r.suggestion.brand])).toEqual([[M(3), NEW]]);
    expect(getBrandNames()).not.toContain(NEW); // previewing saves nothing
  });

  it("catalog import adds the ticked brands, then files rows under them", async () => {
    const res = await importCatalog(file, {}, { addBrands: [NEW, ` ${NEW.toLowerCase()} `] });
    expect(res).toMatchObject({ created: 3, brandsAdded: 1 });
    expect(getBrandNames()).toContain(NEW);
    expect(db.select().from(modelCatalog).where(eq(modelCatalog.model, M(1))).get()?.brand).toBe(NEW);
    expect(db.select().from(modelCatalog).where(eq(modelCatalog.model, M(3))).get()?.brand ?? null).toBeNull();
  });

  it("promo resolve previews ticked brands and import adds them", async () => {
    const res = await resolvePromoRows([{ modelNumber: M(4), collection: `C${T}`, brandText: TYPO }], { extraBrands: [NEW] });
    if ("error" in res) throw new Error(res.error);
    expect(res.resolved[0].suggestion).toMatchObject({ brand: NEW, source: "sheet-typo" });
    const imp = await importPromos([{ modelNumber: M(4), collection: `C${T}`, brand: NEW }], null, null, { addBrands: [NEW] });
    expect(imp).toMatchObject({ imported: 1, brandsAdded: 1 });
    expect(db.select().from(promoItems).where(eq(promoItems.modelNumber, M(4))).get()?.brand).toBe(NEW);
  });
});
