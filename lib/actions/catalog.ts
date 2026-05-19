"use server";
import { db } from "@/lib/db";
import { clients, promoWatches, promoMatches, modelCatalog, activityEvents, type ProductOfInterest } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireManager } from "./_shared";
import { normalizeModel } from "@/lib/normalize";
import { buildPromoClientIndex, matchPromoToClients } from "@/lib/promo-match";
import { getCatalogIndex } from "./model-catalog";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Apply a catalog collection change for `model` and steamroll it through
 * client data: rewrite the collection on every client interest entry with
 * that model, then recompute those clients' promo matches by reusing the
 * exact promos.ts matcher over just the affected client set.
 */
function applyCorrection(
  tx: Tx,
  model: string,
  collection: string,
  source: "curated" | "promo",
  employeeId: string,
): { affected: number } {
  const m = normalizeModel(model);
  const c = collection.trim();

  // Deliberate manager action: force the write and clear any flag
  // (bypasses recordModelCollection's ingestion-time precedence).
  const existing = tx.select().from(modelCatalog).where(eq(modelCatalog.model, m)).get();
  if (existing) {
    tx.update(modelCatalog)
      .set({ collection: c, source, updatedAt: new Date(), flaggedCollection: null, flaggedSource: null, flaggedAt: null })
      .where(eq(modelCatalog.model, m))
      .run();
  } else {
    tx.insert(modelCatalog).values({ model: m, collection: c, source }).run();
  }

  const all = tx.select({ id: clients.id, productsOfInterest: clients.productsOfInterest }).from(clients).all();
  const affected: { id: string; productsOfInterest: ProductOfInterest[] }[] = [];
  for (const row of all) {
    const poi = row.productsOfInterest ?? [];
    let changed = false;
    const next = poi.map((p) => {
      if (normalizeModel(p.model) === m && p.collection !== c) {
        changed = true;
        return { ...p, collection: c };
      }
      return p;
    });
    if (changed) affected.push({ id: row.id, productsOfInterest: next });
  }

  for (const a of affected) {
    tx.update(clients)
      .set({ productsOfInterest: a.productsOfInterest, updatedAt: new Date() })
      .where(eq(clients.id, a.id))
      .run();
    tx.insert(activityEvents).values({
      id: randomUUID(),
      clientId: a.id,
      eventType: "edited",
      description: `Catalog correction: ${m} collection set to ${c}`,
      employeeId,
      metadata: { source: "catalog_correction", model: m, collection: c },
    }).run();
  }

  // Re-match: drop affected clients' promo matches and rebuild from the
  // corrected data against all active promos (index over only those clients).
  if (affected.length > 0) {
    const ids = affected.map((a) => a.id);
    tx.delete(promoMatches).where(inArray(promoMatches.clientId, ids)).run();
    const index = buildPromoClientIndex(affected, getCatalogIndex());
    const promos = tx.select().from(promoWatches).all();
    for (const promo of promos) {
      matchPromoToClients(tx, promo.id, promo.modelNumber, promo.collection, promo.brand, index);
    }
  }

  return { affected: affected.length };
}

export async function correctCatalog(
  model: string,
  collection: string,
): Promise<{ error: string } | { affected: number }> {
  const user = await requireManager();
  if (!model?.trim() || !collection?.trim()) {
    return { error: "Model and collection are required" };
  }
  try {
    let result = { affected: 0 };
    db.transaction((tx) => {
      result = applyCorrection(tx, model, collection, "curated", user.id);
    });
    revalidatePath("/catalog");
    revalidatePath("/clients");
    return result;
  } catch (err) {
    console.error("correctCatalog failed:", err);
    return { error: "Failed to correct catalog" };
  }
}

/**
 * Resolve a pending promo-vs-curated flag. `accept` adopts the flagged
 * promo collection (and cascades it like a correction); rejecting keeps
 * the curated value. Either way the flag is cleared.
 */
export async function resolveFlag(
  model: string,
  accept: boolean,
): Promise<{ error: string } | { affected: number }> {
  const user = await requireManager();
  try {
    const m = normalizeModel(model);
    const row = db.select().from(modelCatalog).where(eq(modelCatalog.model, m)).get();
    if (!row || !row.flaggedCollection) return { error: "No pending flag for this model" };

    let result = { affected: 0 };
    if (accept) {
      const flagged = row.flaggedCollection;
      // Accepting a promo flag keeps it promo-tracked (a later promo import
      // may legitimately update it again). Accepting a manual flag is a
      // deliberate manager decision — bless it as curated/authoritative.
      const adoptSource = row.flaggedSource === "manual" ? "curated" : "promo";
      db.transaction((tx) => {
        result = applyCorrection(tx, m, flagged, adoptSource, user.id);
      });
    } else {
      db.update(modelCatalog)
        .set({ flaggedCollection: null, flaggedSource: null, flaggedAt: null })
        .where(eq(modelCatalog.model, m))
        .run();
    }
    revalidatePath("/catalog");
    revalidatePath("/clients");
    return result;
  } catch (err) {
    console.error("resolveFlag failed:", err);
    return { error: "Failed to resolve flag" };
  }
}

export async function listCatalog() {
  await requireManager();
  return db.select().from(modelCatalog).orderBy(modelCatalog.model).all();
}
