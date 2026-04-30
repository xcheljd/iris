import { vi, describe, it, expect, afterEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { importPromos, clearAllPromos, createPromo } from "@/lib/actions";
import { db } from "@/lib/db";
import { promoWatches, promoMatches } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("Promo Import Actions", () => {
  const createdPromoIds: string[] = [];

  afterEach(() => {
    for (const id of createdPromoIds) {
      try {
        db.delete(promoMatches).where(eq(promoMatches.promoId, id)).run();
        db.delete(promoWatches).where(eq(promoWatches.id, id)).run();
      } catch {
        // ignore
      }
    }
    createdPromoIds.length = 0;
  });

  describe("importPromos", () => {
    it("should import multiple valid rows", async () => {
      const prefix = `IMP-${Date.now()}`;
      const result = await importPromos([
        { modelNumber: `${prefix}-A`, collection: "TestCol1" },
        { modelNumber: `${prefix}-B`, collection: "TestCol2" },
        { modelNumber: `${prefix}-C`, collection: "TestCol3" },
      ]);

      expect(result.imported).toBe(3);

      // Verify promos were created
      for (const suffix of ["A", "B", "C"]) {
        const promo = db.select().from(promoWatches)
          .where(eq(promoWatches.modelNumber, `${prefix}-${suffix}`))
          .get();
        expect(promo).toBeDefined();
        if (promo) createdPromoIds.push(promo.id);
      }
    });

    it("should skip rows with empty modelNumber or collection", async () => {
      const prefix = `SKIP-${Date.now()}`;
      const result = await importPromos([
        { modelNumber: `${prefix}-A`, collection: "ValidCol" },
        { modelNumber: "", collection: "EmptyModel" },
        { modelNumber: "   ", collection: "WhitespaceModel" },
        { modelNumber: `${prefix}-D`, collection: "" },
        { modelNumber: `${prefix}-E`, collection: "   " },
      ]);

      expect(result.imported).toBe(1); // Only the first row is valid

      const promo = db.select().from(promoWatches)
        .where(eq(promoWatches.modelNumber, `${prefix}-A`))
        .get();
      expect(promo).toBeDefined();
      if (promo) createdPromoIds.push(promo.id);
    });

    it("should set promoStart and promoEnd when provided", async () => {
      const prefix = `DATE-${Date.now()}`;
      const result = await importPromos(
        [{ modelNumber: `${prefix}-A`, collection: "DateCol" }],
        "2026-01-01",
        "2026-06-30"
      );

      expect(result.imported).toBe(1);

      const promo = db.select().from(promoWatches)
        .where(eq(promoWatches.modelNumber, `${prefix}-A`))
        .get();
      expect(promo).toBeDefined();
      expect(promo!.promoStart).toBe("2026-01-01");
      expect(promo!.promoEnd).toBe("2026-06-30");
      if (promo) createdPromoIds.push(promo.id);
    });

    it("should revalidate promos path", async () => {
      const { revalidatePath } = await import("next/cache");
      const prefix = `REVAL-${Date.now()}`;

      await importPromos([{ modelNumber: `${prefix}-A`, collection: "RevalCol" }]);

      expect(revalidatePath).toHaveBeenCalledWith("/promos");

      const promo = db.select().from(promoWatches)
        .where(eq(promoWatches.modelNumber, `${prefix}-A`))
        .get();
      if (promo) createdPromoIds.push(promo.id);
    });

    it("should return imported count of 0 for all invalid rows", async () => {
      const result = await importPromos([
        { modelNumber: "", collection: "" },
        { modelNumber: "   ", collection: "   " },
      ]);

      expect(result.imported).toBe(0);
    });
  });

  describe("clearAllPromos", () => {
    it("should delete all promo matches and watches", async () => {
      // Create some test promos first
      const prefix = `CLEAR-${Date.now()}`;
      await createPromo(`${prefix}-A`, "ClearCol1");
      await createPromo(`${prefix}-B`, "ClearCol2");

      // Verify they exist
      const beforePromos = db.select().from(promoWatches)
        .where(eq(promoWatches.modelNumber, `${prefix}-A`))
        .get();
      expect(beforePromos).toBeDefined();

      // Now clear
      await clearAllPromos();

      // Verify they're gone
      const afterA = db.select().from(promoWatches)
        .where(eq(promoWatches.modelNumber, `${prefix}-A`))
        .get();
      const afterB = db.select().from(promoWatches)
        .where(eq(promoWatches.modelNumber, `${prefix}-B`))
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
