import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { importPromos, clearAllPromos, createPromo, resolvePromoRows } from "@/lib/actions";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};
import { db } from "@/lib/db";
import { promoItems, promoMatches, modelCatalog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("Promo Import Actions", () => {
  const createdPromoIds: string[] = [];
  const catalogModels: string[] = [];

  beforeEach(() => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
  });

  afterEach(() => {
    for (const id of createdPromoIds) {
      try {
        db.delete(promoMatches).where(eq(promoMatches.promoId, id)).run();
        db.delete(promoItems).where(eq(promoItems.id, id)).run();
      } catch {
        // ignore
      }
    }
    for (const m of catalogModels) {
      try { db.delete(modelCatalog).where(eq(modelCatalog.model, m)).run(); } catch { /* ignore */ }
    }
    createdPromoIds.length = 0;
    catalogModels.length = 0;
  });

  describe("importPromos", () => {
    it("should import multiple valid rows", async () => {
      const prefix = `IMP-${Date.now()}`;
      const result = await importPromos([
        { modelNumber: `${prefix}-A`, collection: "TestCol1", brand: "Maravista" },
        { modelNumber: `${prefix}-B`, collection: "TestCol2", brand: "Maravista" },
        { modelNumber: `${prefix}-C`, collection: "TestCol3", brand: "Maravista" },
      ]);

      expect(result.imported).toBe(3);

      // Verify promos were created
      for (const suffix of ["A", "B", "C"]) {
        const promo = db.select().from(promoItems)
          .where(eq(promoItems.modelNumber, `${prefix}-${suffix}`))
          .get();
        expect(promo).toBeDefined();
        if (promo) createdPromoIds.push(promo.id);
      }
    });

    it("should skip rows with empty modelNumber or collection", async () => {
      const prefix = `SKIP-${Date.now()}`;
      const result = await importPromos([
        { modelNumber: `${prefix}-A`, collection: "ValidCol", brand: "Maravista" },
        { modelNumber: "", collection: "EmptyModel", brand: "Maravista" },
        { modelNumber: "   ", collection: "WhitespaceModel", brand: "Maravista" },
        { modelNumber: `${prefix}-D`, collection: "", brand: "Maravista" },
        { modelNumber: `${prefix}-E`, collection: "   ", brand: "Maravista" },
      ]);

      expect(result.imported).toBe(1); // Only the first row is valid

      const promo = db.select().from(promoItems)
        .where(eq(promoItems.modelNumber, `${prefix}-A`))
        .get();
      expect(promo).toBeDefined();
      if (promo) createdPromoIds.push(promo.id);
    });

    it("should set promoStart and promoEnd when provided", async () => {
      const prefix = `DATE-${Date.now()}`;
      const result = await importPromos(
        [{ modelNumber: `${prefix}-A`, collection: "DateCol", brand: "Maravista" }],
        "2026-01-01",
        "2026-06-30"
      );

      expect(result.imported).toBe(1);

      const promo = db.select().from(promoItems)
        .where(eq(promoItems.modelNumber, `${prefix}-A`))
        .get();
      expect(promo).toBeDefined();
      expect(promo!.promoStart).toBe("2026-01-01");
      expect(promo!.promoEnd).toBe("2026-06-30");
      if (promo) createdPromoIds.push(promo.id);
    });

    it("should revalidate promos path", async () => {
      const { revalidatePath } = await import("next/cache");
      const prefix = `REVAL-${Date.now()}`;

      await importPromos([{ modelNumber: `${prefix}-A`, collection: "RevalCol", brand: "Maravista" }]);

      expect(revalidatePath).toHaveBeenCalledWith("/promos");

      const promo = db.select().from(promoItems)
        .where(eq(promoItems.modelNumber, `${prefix}-A`))
        .get();
      if (promo) createdPromoIds.push(promo.id);
    });

    it("should return imported count of 0 for all invalid rows", async () => {
      const result = await importPromos([
        { modelNumber: "", collection: "", brand: "Maravista" },
        { modelNumber: "   ", collection: "   ", brand: "Maravista" },
      ]);

      expect(result.imported).toBe(0);
    });

    it("uses catalog brand and collection when the model is catalogued, ignoring PDF labels", async () => {
      const model = `CATKNOWN-${Date.now()}`;
      catalogModels.push(model);
      db.insert(modelCatalog).values({
        model, collection: "SHORELINE DEEP", source: "curated",
        brand: "Maravista", msrp: 895,
      }).run();

      const result = await importPromos([
        // PDF "lies" — different collection/brand from catalog. Catalog wins.
        { modelNumber: model.toLowerCase(), collection: "SHORELINE TIDE", brand: "Aldermoor", msrp: 895, discountPrice: 358 },
      ]);
      expect("imported" in result && result.imported).toBe(1);

      const promo = db.select().from(promoItems).where(eq(promoItems.modelNumber, model)).get()!;
      createdPromoIds.push(promo.id);
      expect(promo.collection).toBe("SHORELINE DEEP"); // catalog beat PDF
      expect(promo.brand).toBe("Maravista");             // catalog beat PDF-row brand
      // Curated catalog row gets a flag noting the disagreement.
      const cat = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
      expect(cat.collection).toBe("SHORELINE DEEP");
      expect(cat.flaggedCollection).toBe("SHORELINE TIDE");
    });

    it("uses the per-row brand fallback when the model isn't catalogued", async () => {
      const model = `CATNEW-${Date.now()}`;
      catalogModels.push(model);

      const result = await importPromos([
        { modelNumber: model, collection: "SUNDRIFT", brand: "Maravista" },
      ]);
      expect("imported" in result && result.imported).toBe(1);

      const promo = db.select().from(promoItems).where(eq(promoItems.modelNumber, model)).get()!;
      createdPromoIds.push(promo.id);
      expect(promo.collection).toBe("SUNDRIFT");
      expect(promo.brand).toBe("Maravista");
      // The promo seeds a new catalog row at source=promo with the PDF collection.
      const cat = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
      expect(cat.collection).toBe("SUNDRIFT");
      expect(cat.source).toBe("promo");
    });

    it("imports uncatalogued rows with brand=null when no override is supplied", async () => {
      const model = `CATNB-${Date.now()}`;
      catalogModels.push(model);

      const result = await importPromos([
        { modelNumber: model, collection: "SUNDRIFT" },
      ]);
      expect("imported" in result && result.imported).toBe(1);

      const promo = db.select().from(promoItems).where(eq(promoItems.modelNumber, model)).get()!;
      createdPromoIds.push(promo.id);
      expect(promo.brand).toBeNull();
    });
  });

  describe("resolvePromoRows", () => {
    it("classifies catalogued, uncatalogued, mismatch, and msrp-low rows", async () => {
      const ts = Date.now();
      const ok = `RES-OK-${ts}`;
      const mismatch = `RES-MM-${ts}`;
      const low = `RES-LO-${ts}`;
      const unCat = `RES-NEW-${ts}`;
      const noBrand = `RES-NB-${ts}`;
      catalogModels.push(ok, mismatch, low, unCat, noBrand);

      db.insert(modelCatalog).values([
        { model: ok, collection: "RIVIERA", source: "curated", brand: "Maravista", msrp: 525 },
        { model: mismatch, collection: "SHORELINE DEEP", source: "curated", brand: "Maravista", msrp: 895 },
        { model: low, collection: "RIVIERA", source: "curated", brand: "Maravista", msrp: 500 },
        { model: noBrand, collection: "RIVIERA", source: "promo", brand: null, msrp: null },
      ]).run();

      const out = await resolvePromoRows([
        { modelNumber: ok, collection: "RIVIERA", msrp: 525, discountPrice: 210 },
        { modelNumber: mismatch, collection: "SHORELINE TIDE", msrp: 895, discountPrice: 358 },
        { modelNumber: low, collection: "RIVIERA", msrp: 250, discountPrice: 200 }, // PDF MSRP below catalog
        { modelNumber: unCat, collection: "SUNDRIFT", msrp: 395, discountPrice: 158 },
        { modelNumber: noBrand, collection: "RIVIERA", msrp: 525, discountPrice: 210 },
      ]);
      if ("error" in out) throw new Error(out.error);

      const byModel = Object.fromEntries(out.resolved.map((r) => [r.modelNumber, r]));
      expect(byModel[ok].isUncatalogued).toBe(false);
      expect(byModel[ok].collectionMismatch).toBe(false);
      expect(byModel[ok].msrpLow).toBe(false);
      expect(byModel[ok].effectiveBrand).toBe("Maravista");
      expect(byModel[ok].effectiveCollection).toBe("RIVIERA");

      expect(byModel[mismatch].collectionMismatch).toBe(true);
      expect(byModel[mismatch].effectiveCollection).toBe("SHORELINE DEEP");

      expect(byModel[low].msrpLow).toBe(true);

      expect(byModel[unCat].isUncatalogued).toBe(true);
      expect(byModel[unCat].effectiveBrand).toBeNull();
      expect(byModel[unCat].effectiveCollection).toBe("SUNDRIFT"); // PDF fallback

      // Catalog row exists but brand is null → still treated as uncatalogued.
      expect(byModel[noBrand].isUncatalogued).toBe(true);
    });
  });

  describe("clearAllPromos", () => {
    it("should delete all promo matches and items", async () => {
      // Create some test promos first
      const prefix = `CLEAR-${Date.now()}`;
      await createPromo(`${prefix}-A`, "ClearCol1", "Maravista", null, null, null, { promoStart: null, promoEnd: null });
      await createPromo(`${prefix}-B`, "ClearCol2", "Maravista", null, null, null, { promoStart: null, promoEnd: null });

      // Verify they exist
      const beforePromos = db.select().from(promoItems)
        .where(eq(promoItems.modelNumber, `${prefix}-A`))
        .get();
      expect(beforePromos).toBeDefined();

      // Now clear
      await clearAllPromos();

      // Verify they're gone
      const afterA = db.select().from(promoItems)
        .where(eq(promoItems.modelNumber, `${prefix}-A`))
        .get();
      const afterB = db.select().from(promoItems)
        .where(eq(promoItems.modelNumber, `${prefix}-B`))
        .get();
      expect(afterA).toBeUndefined();
      expect(afterB).toBeUndefined();
    });

    it("should revalidate promos path on clear", async () => {
      const { revalidatePath } = await import("next/cache");

      await clearAllPromos();

      expect(revalidatePath).toHaveBeenCalledWith("/promos");
    });
  });
});
