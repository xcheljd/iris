import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { modelCatalog, type ProductOfInterest } from "@/lib/db/schema";
import { normalizeModel } from "@/lib/normalize";

// drizzle better-sqlite3 transaction handle (same shape as `db`).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;

export type CatalogFlagged = {
  model: string;
  curated: string;
  attempted: string;
};

/**
 * Upsert a model → collection pairing into the durable catalog.
 *
 * Precedence: curated > promo > manual.
 *  - `curated` (manager correction) is authoritative: always (re)writes
 *    and clears any pending flag.
 *  - `promo` overwrites a `promo`/`manual` row, but NEVER a `curated` one
 *    — a disagreeing promo import records the latest pending conflict in
 *    the flagged* columns and returns `{ flagged }` for review.
 *  - `manual` only fills when the model is unknown; it never overwrites.
 *    A disagreeing manual entry keeps the stored value and returns
 *    `{ conflict }`.
 *
 * No-ops when model or collection is missing.
 */
export function recordModelCollection(
  tx: DbOrTx,
  model: string | null | undefined,
  collection: string | null | undefined,
  source: "promo" | "manual" | "curated",
): { flagged?: CatalogFlagged } {
  const m = normalizeModel(model);
  const c = (collection ?? "").trim();
  if (!m || !c) return {};

  const existing = tx.select().from(modelCatalog).where(eq(modelCatalog.model, m)).get();

  if (!existing) {
    // An uncatalogued model entered on a client/prospect (manual) is
    // provisional — the manager must confirm it from the catalog's
    // "needs cataloging" queue. Promo/curated seeds are authoritative.
    tx.insert(modelCatalog)
      .values({ model: m, collection: c, source, needsReview: source === "manual" })
      .run();
    return {};
  }

  if (source === "curated") {
    tx.update(modelCatalog)
      .set({
        collection: c,
        source: "curated",
        updatedAt: new Date(),
        flaggedCollection: null,
        flaggedSource: null,
        flaggedAt: null,
      })
      .where(eq(modelCatalog.model, m))
      .run();
    return {};
  }

  if (source === "promo") {
    if (existing.source === "curated") {
      // Never overwrite a manager correction; record the latest pending
      // conflict for review when it actually disagrees.
      if (existing.collection.toUpperCase() !== c.toUpperCase()) {
        tx.update(modelCatalog)
          .set({ flaggedCollection: c, flaggedSource: "promo", flaggedAt: new Date() })
          .where(eq(modelCatalog.model, m))
          .run();
        return { flagged: { model: m, curated: existing.collection, attempted: c } };
      }
      return {};
    }
    if (existing.collection !== c || existing.source !== "promo") {
      tx.update(modelCatalog)
        .set({ collection: c, source: "promo", updatedAt: new Date() })
        .where(eq(modelCatalog.model, m))
        .run();
    }
    return {};
  }

  // manual + already known: no-op. The catalog is authoritative and
  // derive-at-read makes any divergent stored value irrelevant, so a
  // manual entry for a known model neither overwrites nor flags.
  return {};
}

/**
 * Record every model+collection pair from a client's interests as a
 * `manual` catalog entry. Entries missing either field contribute
 * nothing. An uncatalogued model becomes a provisional (needs-review)
 * row; a known model is a no-op (the catalog is authoritative).
 */
export function recordProductsOfInterest(
  tx: DbOrTx,
  products: ProductOfInterest[] | null | undefined,
): void {
  for (const p of products ?? []) {
    recordModelCollection(tx, p.model, p.collection, "manual");
  }
}

/** Full model → collection lookup (uppercase keys), durable across promo resets. */
export function getCatalogMap(): Record<string, string> {
  const rows = db.select({ model: modelCatalog.model, collection: modelCatalog.collection }).from(modelCatalog).all();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.model] = r.collection;
  return map;
}

export type CatalogEntry = { collection: string; brand: string | null };

/**
 * Model → {collection, brand} index for derive-at-read. Keys are the
 * stored (uppercase) model; callers look up via normalizeModel(poi.model).
 */
export function getCatalogIndex(): Map<string, CatalogEntry> {
  const rows = db
    .select({ model: modelCatalog.model, collection: modelCatalog.collection, brand: modelCatalog.brand })
    .from(modelCatalog)
    .all();
  const idx = new Map<string, CatalogEntry>();
  for (const r of rows) idx.set(r.model, { collection: r.collection, brand: r.brand ?? null });
  return idx;
}
