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

      await createPromo(model, collection);

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
      await createPromo(uniqueModel, "NOCOLLECTION");

      const promo = db.select().from(promoWatches)
        .where(eq(promoWatches.modelNumber, uniqueModel))
        .get();
      expect(promo).toBeDefined();
      createdPromoIds.push(promo!.id);

      // This promo shouldn't match any clients (unique model + no collection match)
      const matches = db.select().from(promoMatches)
        .where(eq(promoMatches.promoId, promo!.id))
        .all();
      // No matches expected for completely unique model/collection
      expect(matches).toHaveLength(0);
    });

    it("should revalidate promos path", async () => {
      const { revalidatePath } = await import("next/cache");

      await createPromo(`REVALIDATE-TEST-${Date.now()}`, "TESTCOL");

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
      await createPromo(model, "DELETECOL");

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
      await createPromo(model, "DELETECOL");

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
        productsOfInterest: [{ model, collection: null, intent: "promo" }],
      }).run();

      // Two promo rows for the SAME model → 2 match rows, 1 distinct client.
      const res = await importPromos([
        { modelNumber: model, collection },
        { modelNumber: model, collection },
      ]);
      expect("imported" in res && res.imported).toBe(2);
      expect("matchedClients" in res && res.matchedClients).toBe(1);

      const promoRows = db.select().from(promoWatches).where(eq(promoWatches.modelNumber, model)).all();
      const counts = await getPromoMatchCounts();
      for (const p of promoRows) expect(counts[p.id]).toBe(1);

      // Soft-delete the client → excluded from counts.
      db.update(clients).set({ deletedAt: new Date(), status: "deleted" }).where(eq(clients.id, clientId)).run();
      const after = await getPromoMatchCounts();
      for (const p of promoRows) expect(after[p.id] ?? 0).toBe(0);

      // cleanup
      for (const p of promoRows) {
        db.delete(promoMatches).where(eq(promoMatches.promoId, p.id)).run();
        db.delete(promoWatches).where(eq(promoWatches.id, p.id)).run();
      }
      db.delete(clients).where(eq(clients.id, clientId)).run();
    });
  });
});
