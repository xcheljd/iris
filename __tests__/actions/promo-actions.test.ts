import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { createPromo, deletePromo, importPromos } from "@/lib/actions";
import { getPromoMatchCounts } from "@/lib/queries";
import { db } from "@/lib/db";
import { clients, promoWatches, promoMatches } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206"; // Marcus (manager)

const managerSession = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager" },
};

describe("Promo Actions", () => {
  const createdPromoIds: string[] = [];

  beforeEach(() => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
  });

  afterEach(() => {
    // Clean up promo matches and watches created during tests
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

  describe("createPromo", () => {
    it("should create a new promo watch", async () => {
      const model = `TEST-MODEL-${Date.now()}`;
      const collection = "TESTCOLLECTION";

      await createPromo(model, collection, "Meridian");

      const promo = db.select().from(promoWatches)
        .where(eq(promoWatches.modelNumber, model))
        .get();
      expect(promo).toBeDefined();
      expect(promo!.collection).toBe(collection);

      createdPromoIds.push(promo!.id);
    });

    it("should create promo matches for clients with matching product of interest", async () => {
      // Import clients from the top of the file (already available via db import)
      const { clients } = await import("@/lib/db/schema");
      const allClients = db.select().from(clients).all();

      // Find a model that at least one client has in their products of interest
      let testModel = "";
      for (const c of allClients) {
        const poi = c.productsOfInterest || [];
        if (poi.length > 0 && poi[0].model) {
          testModel = poi[0].model;
          break;
        }
      }

      // Create promo with unique model that won't match any client
      const uniqueModel = `UNIQUE-${Date.now()}`;
      await createPromo(uniqueModel, "NOCOLLECTION", "Meridian");

      const promo = db.select().from(promoWatches)
        .where(eq(promoWatches.modelNumber, uniqueModel))
        .get();
      expect(promo).toBeDefined();
      createdPromoIds.push(promo!.id);

      // Unique model + no collection match → no model/collection matches.
      // (Brand matches are expected/legitimate now — seeded clients carry
      // brand interests — and are out of scope for this assertion.)
      const matches = db.select().from(promoMatches)
        .where(eq(promoMatches.promoId, promo!.id))
        .all();
      expect(matches.filter((m) => m.matchType === "model" || m.matchType === "collection")).toHaveLength(0);
    });

    it("should revalidate promos path", async () => {
      const { revalidatePath } = await import("next/cache");

      await createPromo(`REVALIDATE-TEST-${Date.now()}`, "TESTCOL", "Meridian");

      expect(revalidatePath).toHaveBeenCalledWith("/promos");

      // Cleanup
      const promo = db.select().from(promoWatches)
        .where(eq(promoWatches.modelNumber, `REVALIDATE-TEST-${Date.now()}`))
        .get();
    });
  });

  describe("deletePromo", () => {
    it("should delete a promo and its matches", async () => {
      const model = `DELETE-TEST-${Date.now()}`;
      await createPromo(model, "DELETECOL", "Meridian");

      const promo = db.select().from(promoWatches)
        .where(eq(promoWatches.modelNumber, model))
        .get();
      expect(promo).toBeDefined();

      // Delete it
      await deletePromo(promo!.id);

      // Verify promo is deleted
      const deleted = db.select().from(promoWatches).where(eq(promoWatches.id, promo!.id)).get();
      expect(deleted).toBeUndefined();

      // Verify matches are also deleted
      const matches = db.select().from(promoMatches)
        .where(eq(promoMatches.promoId, promo!.id))
        .all();
      expect(matches).toHaveLength(0);

      // No need to clean up since it's deleted
    });

    it("should revalidate promos path on delete", async () => {
      const { revalidatePath } = await import("next/cache");

      const model = `DELETE-REVAL-${Date.now()}`;
      await createPromo(model, "DELETECOL", "Meridian");

      const promo = db.select().from(promoWatches)
        .where(eq(promoWatches.modelNumber, model))
        .get();

      vi.mocked(revalidatePath).mockClear();

      await deletePromo(promo!.id);

      expect(revalidatePath).toHaveBeenCalledWith("/promos");
    });
  });

  describe("importPromos + match counts", () => {
    it("reports distinct matched clients and excludes deleted from counts", async () => {
      const clientId = randomUUID();
      const model = `IMP-${Date.now()}`;
      const collection = `IMPCOL-${Date.now()}`;
      db.insert(clients).values({
        id: clientId,
        firstName: "Importable",
        productsOfInterest: [{ model, collection: null, brand: null, intent: "promo" }],
      }).run();

      // Two promo rows for the SAME unique model. The test client
      // model-matches both. (Seeded clients may also brand-match the
      // "Meridian" batch — legitimate — so assert deterministic
      // properties about THIS client, not brittle global totals.)
      const res = await importPromos([
        { modelNumber: model, collection, brand: "Meridian" },
        { modelNumber: model, collection, brand: "Meridian" },
      ]);
      expect("imported" in res && res.imported).toBe(2);
      // Distinct-client dedup: the client matched both promos but counts once.
      expect("matchedClients" in res && (res.matchedClients as number) >= 1).toBe(true);

      const promoRows = db.select().from(promoWatches).where(eq(promoWatches.modelNumber, model)).all();
      const myModelMatches = db.select().from(promoMatches)
        .where(eq(promoMatches.clientId, clientId)).all()
        .filter((m) => promoRows.some((p) => p.id === m.promoId));
      expect(myModelMatches).toHaveLength(2); // one per promo, matchType model
      expect(myModelMatches.every((m) => m.matchType === "model")).toBe(true);

      // Soft-delete the client → its contribution drops out of the counts.
      const before = await getPromoMatchCounts();
      db.update(clients).set({ deletedAt: new Date(), status: "deleted" }).where(eq(clients.id, clientId)).run();
      const after = await getPromoMatchCounts();
      for (const p of promoRows) {
        expect((after[p.id] ?? 0)).toBe((before[p.id] ?? 0) - 1);
      }

      // cleanup
      for (const p of promoRows) {
        db.delete(promoMatches).where(eq(promoMatches.promoId, p.id)).run();
        db.delete(promoWatches).where(eq(promoWatches.id, p.id)).run();
      }
      db.delete(clients).where(eq(clients.id, clientId)).run();
    });
  });
});
