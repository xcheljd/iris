"use server";
import { db } from "@/lib/db";
import { clients, promoWatches, promoMatches, modelCatalog, activityEvents, type ProductOfInterest, type Brand } from "@/lib/db/schema";
import { and, asc, desc, eq, gte, inArray, isNotNull, like, lte, or, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireManager, isSessionEmployeeStale } from "./_shared";

const STALE_SESSION_ERROR =
  "Your session is out of sync with the employee record. Sign out and sign back in, then retry.";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { normalizeModel } from "@/lib/normalize";
import { buildPromoClientIndex, matchPromoToClients } from "@/lib/promo-match";
import { getCatalogIndex, recordProductsOfInterest } from "./model-catalog";

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
      .set({ collection: c, source, updatedAt: new Date(), needsReview: false, flaggedCollection: null, flaggedSource: null, flaggedAt: null })
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
  }
  if (affected.length > 0) {
    tx.insert(activityEvents).values(affected.map((a) => ({
      id: randomUUID(),
      clientId: a.id,
      eventType: "edited" as const,
      description: `Catalog correction: ${m} collection set to ${c}`,
      employeeId,
      metadata: { source: "catalog_correction", model: m, collection: c },
    }))).run();
  }

  rematchClientPromos(tx, affected);

  return { affected: affected.length };
}

/**
 * Drop the given clients' promo matches and rebuild them from the current
 * catalog state against all active promos. Cheap re-index over only the
 * affected clients — call after any catalog mutation that could change a
 * cataloged model's derived collection/brand.
 */
function rematchClientPromos(
  tx: Tx,
  affected: { id: string; productsOfInterest: ProductOfInterest[] }[],
): void {
  if (affected.length === 0) return;
  const ids = affected.map((a) => a.id);
  tx.delete(promoMatches).where(inArray(promoMatches.clientId, ids)).run();
  const index = buildPromoClientIndex(affected, getCatalogIndex());
  const promos = tx.select().from(promoWatches).all();
  for (const promo of promos) {
    matchPromoToClients(tx, promo.id, promo.modelNumber, promo.collection, index);
  }
}

export async function correctCatalog(
  model: string,
  collection: string,
): Promise<{ error: string } | { affected: number }> {
  const user = await requireManager();
  if (await isSessionEmployeeStale(user.id)) return { error: STALE_SESSION_ERROR };
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
  if (await isSessionEmployeeStale(user.id)) return { error: STALE_SESSION_ERROR };
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
    revalidatePath("/", "layout");
    return result;
  } catch (err) {
    console.error("resolveFlag failed:", err);
    return { error: "Failed to resolve flag" };
  }
}

export async function confirmCatalogRow(model: string): Promise<{ error: string } | { ok: true }> {
  await requireManager();
  const m = normalizeModel(model);
  if (!m) return { error: "Model is required" };
  db.update(modelCatalog)
    .set({ needsReview: false, source: "curated", updatedAt: new Date() })
    .where(eq(modelCatalog.model, m))
    .run();
  revalidatePath("/catalog");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Bulk version — confirm many rows in one statement. No promo re-match
 * needed; confirm only flips needsReview/source and doesn't change the
 * collection. */
export async function confirmCatalogRows(
  models: string[],
): Promise<{ error: string } | { confirmed: number }> {
  await requireManager();
  const normalized = Array.from(new Set(models.map(normalizeModel).filter(Boolean)));
  if (normalized.length === 0) return { error: "No models provided" };
  try {
    const r = db
      .update(modelCatalog)
      .set({ needsReview: false, source: "curated", updatedAt: new Date() })
      .where(inArray(modelCatalog.model, normalized))
      .run();
    revalidatePath("/catalog");
    revalidatePath("/", "layout");
    return { confirmed: r.changes ?? 0 };
  } catch (err) {
    console.error("confirmCatalogRows failed:", err);
    return { error: "Failed to confirm catalog rows" };
  }
}

/** Bulk version — delete many rows, then re-match the union of affected
 * clients exactly once (cheaper than calling deleteCatalogRow N times,
 * which would do N re-match cycles). */
export async function deleteCatalogRows(
  models: string[],
): Promise<{ error: string } | { deleted: number; affected: number }> {
  const user = await requireManager();
  if (await isSessionEmployeeStale(user.id)) return { error: STALE_SESSION_ERROR };
  const normalized = Array.from(new Set(models.map(normalizeModel).filter(Boolean)));
  if (normalized.length === 0) return { error: "No models provided" };

  try {
    let deleted = 0;
    let affectedCount = 0;
    db.transaction((tx) => {
      const existing = tx
        .select({ model: modelCatalog.model })
        .from(modelCatalog)
        .where(inArray(modelCatalog.model, normalized))
        .all();
      const presentModels = new Set(existing.map((r) => r.model));
      if (presentModels.size === 0) return;

      const delResult = tx
        .delete(modelCatalog)
        .where(inArray(modelCatalog.model, Array.from(presentModels)))
        .run();
      deleted = delResult.changes ?? 0;

      const all = tx
        .select({ id: clients.id, productsOfInterest: clients.productsOfInterest })
        .from(clients)
        .all();
      const affected: { id: string; productsOfInterest: ProductOfInterest[] }[] = [];
      const events: (typeof activityEvents.$inferInsert)[] = [];
      for (const row of all) {
        const poi = row.productsOfInterest ?? [];
        const hits = poi.filter((p) => presentModels.has(normalizeModel(p.model)));
        if (hits.length === 0) continue;
        affected.push({ id: row.id, productsOfInterest: poi });
        for (const h of hits) {
          const m = normalizeModel(h.model);
          events.push({
            id: randomUUID(),
            clientId: row.id,
            eventType: "edited",
            description: `Catalog entry removed for ${m}`,
            employeeId: user.id,
            metadata: { source: "catalog_delete", model: m },
          });
        }
      }
      if (events.length > 0) tx.insert(activityEvents).values(events).run();

      rematchClientPromos(tx, affected);
      affectedCount = affected.length;
    });
    revalidatePath("/catalog");
    revalidatePath("/clients");
    return { deleted, affected: affectedCount };
  } catch (err) {
    console.error("deleteCatalogRows failed:", err);
    return { error: "Failed to delete catalog rows" };
  }
}

/**
 * Delete one catalog row. The model stays on any client's products of
 * interest (that's their data) — only the authoritative collection/brand
 * mapping is removed; derive-at-read will fall back to whatever was
 * stored on the POI. Promo matches for affected clients are rebuilt so
 * stale collection-based matches don't linger.
 */
export async function deleteCatalogRow(
  model: string,
): Promise<{ error: string } | { affected: number }> {
  const user = await requireManager();
  if (await isSessionEmployeeStale(user.id)) return { error: STALE_SESSION_ERROR };
  const m = normalizeModel(model);
  if (!m) return { error: "Model is required" };

  try {
    let affectedCount = 0;
    db.transaction((tx) => {
      const existing = tx.select().from(modelCatalog).where(eq(modelCatalog.model, m)).get();
      if (!existing) return;

      tx.delete(modelCatalog).where(eq(modelCatalog.model, m)).run();

      const all = tx.select({ id: clients.id, productsOfInterest: clients.productsOfInterest }).from(clients).all();
      const affected: { id: string; productsOfInterest: ProductOfInterest[] }[] = [];
      for (const row of all) {
        const poi = row.productsOfInterest ?? [];
        if (poi.some((p) => normalizeModel(p.model) === m)) {
          affected.push({ id: row.id, productsOfInterest: poi });
        }
      }

      if (affected.length > 0) {
        tx.insert(activityEvents).values(affected.map((a) => ({
          id: randomUUID(),
          clientId: a.id,
          eventType: "edited" as const,
          description: `Catalog entry removed for ${m}`,
          employeeId: user.id,
          metadata: { source: "catalog_delete", model: m },
        }))).run();
      }

      rematchClientPromos(tx, affected);
      affectedCount = affected.length;
    });
    revalidatePath("/catalog");
    revalidatePath("/clients");
    return { affected: affectedCount };
  } catch (err) {
    console.error("deleteCatalogRow failed:", err);
    return { error: "Failed to delete catalog entry" };
  }
}

/**
 * Wipe the entire catalog, then re-seed provisional `needsReview` rows
 * from every client's products of interest so no model the sales team
 * already entered gets silently lost. The next RVX import overrides
 * these; anything the import doesn't cover stays in the Needs cataloging
 * queue for manager review. Deliberately does NOT recompute promo matches
 * — those are repaired by the next import / correction.
 */
export async function clearCatalog(): Promise<{ error: string } | { cleared: number; provisioned: number }> {
  await requireManager();
  try {
    let cleared = 0;
    let provisioned = 0;
    db.transaction((tx) => {
      const countRow = tx.select({ n: sql<number>`count(*)` }).from(modelCatalog).get();
      cleared = Number(countRow?.n ?? 0);
      tx.delete(modelCatalog).run();

      const poiRows = tx
        .select({ poi: clients.productsOfInterest })
        .from(clients)
        .all();
      for (const row of poiRows) {
        recordProductsOfInterest(tx, row.poi);
      }
      const afterRow = tx.select({ n: sql<number>`count(*)` }).from(modelCatalog).get();
      provisioned = Number(afterRow?.n ?? 0);
    });
    revalidatePath("/catalog");
    revalidatePath("/clients");
    return { cleared, provisioned };
  } catch (err) {
    console.error("clearCatalog failed:", err);
    return { error: "Failed to clear catalog" };
  }
}

export async function getCatalogFlagCount(): Promise<number> {
  await requireManager();
  const result = db
    .select({ c: sql<number>`count(*)` })
    .from(modelCatalog)
    .where(or(eq(modelCatalog.needsReview, true), isNotNull(modelCatalog.flaggedCollection)))
    .get();
  return Number(result?.c ?? 0);
}

export async function listCatalog({
  mod = "",
  col = "",
  brands = [] as string[],
  msrpMin,
  msrpMax,
  sort = "model" as "model" | "collection" | "brand" | "msrp",
  dir = "asc" as "asc" | "desc",
  page = 1,
}: {
  mod?: string;
  col?: string;
  brands?: string[];
  msrpMin?: number;
  msrpMax?: number;
  sort?: "model" | "collection" | "brand" | "msrp";
  dir?: "asc" | "desc";
  page?: number;
} = {}) {
  await requireManager();

  const conditions: SQL[] = [];
  const modU = mod.trim().toUpperCase();
  const colU = col.trim().toUpperCase();
  if (modU) conditions.push(like(modelCatalog.model, `%${modU}%`));
  if (colU) conditions.push(like(modelCatalog.collection, `%${colU}%`));
  if (brands.length) conditions.push(inArray(modelCatalog.brand, brands as Brand[]));
  if (msrpMin != null) conditions.push(gte(modelCatalog.msrp, msrpMin));
  if (msrpMax != null) conditions.push(lte(modelCatalog.msrp, msrpMax));
  const filter = conditions.length > 0 ? and(...conditions) : undefined;

  const sortCol =
    sort === "collection" ? modelCatalog.collection
    : sort === "brand" ? modelCatalog.brand
    : sort === "msrp" ? modelCatalog.msrp
    : modelCatalog.model;
  // MSRP is nullable; keep unpriced rows at the bottom in both directions
  // rather than letting SQLite's default surface them first on ascending.
  const order =
    sort === "msrp"
      ? sql`${modelCatalog.msrp} ${sql.raw(dir === "desc" ? "desc" : "asc")} nulls last`
      : dir === "desc" ? desc(sortCol) : asc(sortCol);
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;

  const rows = db.select().from(modelCatalog).where(filter).orderBy(order).limit(DEFAULT_PAGE_SIZE).offset(offset).all();
  const totalRow = db.select({ n: sql<number>`count(*)` }).from(modelCatalog).where(filter).get();
  const needsReview = db.select().from(modelCatalog).where(eq(modelCatalog.needsReview, true)).orderBy(asc(modelCatalog.model)).all();
  const flagged = db.select().from(modelCatalog).where(isNotNull(modelCatalog.flaggedCollection)).orderBy(asc(modelCatalog.model)).all();
  // Global (unfiltered) max so the slider's upper bound stays stable as filters change.
  const ceilingRow = db.select({ m: sql<number>`max(${modelCatalog.msrp})` }).from(modelCatalog).get();

  return { rows, total: Number(totalRow?.n ?? 0), needsReview, flagged, msrpCeiling: Math.ceil(Number(ceilingRow?.m ?? 0)) };
}
