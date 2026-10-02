import { randomUUID } from "crypto";
import { inArray } from "drizzle-orm";
import type { db } from "@/lib/db";
import { clients, promoMatches, promoWatches, type ProductOfInterest } from "@/lib/db/schema";
import { normalizeModel } from "@/lib/normalize";
import { resolveInterest } from "@/lib/resolve-interest";
import { getCatalogIndex, type CatalogEntry } from "@/lib/actions/model-catalog";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Promo ↔ client matching, extracted so both promo create/import and a
// catalog correction's re-match reuse the exact same logic (and so it can
// live outside a "use server" module). Collections are compared
// case-insensitively; models via normalizeModel (uppercase) on both sides.

interface PromoClientEntry {
  id: string;
  collections: Set<string>;
}
export interface PromoClientIndex {
  modelMap: Map<string, string[]>; // normalized model → clientIds (exact lookup)
  entries: PromoClientEntry[];     // for exact collection match
}

// Banned and deleted clients never get promo matches: they are off every
// surface that would contact them, so a match would only be noise.
export function buildPromoClientIndex(
  all: Array<{
    id: string;
    productsOfInterest: ProductOfInterest[] | null;
    status: typeof clients.$inferSelect.status;
    deletedAt: Date | null;
  }>,
  catalog: Map<string, CatalogEntry>,
): PromoClientIndex {
  const modelMap = new Map<string, string[]>();
  const entries: PromoClientEntry[] = [];
  for (const c of all) {
    if (c.status === "banned" || c.status === "deleted" || c.deletedAt) continue;
    const collections = new Set<string>();
    for (const p of c.productsOfInterest ?? []) {
      const m = normalizeModel(p.model);
      if (m) {
        const arr = modelMap.get(m);
        if (arr) arr.push(c.id);
        else modelMap.set(m, [c.id]);
      }
      // Derive-at-read: catalog wins for cataloged models; the POI's
      // stored collection only feeds collection-only interests.
      const { collection } = resolveInterest(p, catalog);
      if (collection) collections.add(collection.trim().toUpperCase());
    }
    entries.push({ id: c.id, collections });
  }
  return { modelMap, entries };
}

// Brand-level matches were dropped — they fired indiscriminately for every
// client owning the brand. "Interested in a brand" is now expressed via tags
// (e.g., "Meridian", "Ashford") and surfaced through Smart Lists / tag filters,
// not the promo matcher.
export function matchPromoToClients(
  tx: Pick<typeof db, "insert">,
  promoId: string,
  modelNumber: string,
  collection: string,
  index: PromoClientIndex,
) {
  const model = normalizeModel(modelNumber);
  const coll = collection.trim().toUpperCase();
  const matches: { id: string; clientId: string; promoId: string; matchType: "model" | "collection" }[] = [];

  const modelClientIds = model ? index.modelMap.get(model) ?? [] : [];
  const matched = new Set(modelClientIds);
  for (const clientId of modelClientIds) {
    matches.push({ id: randomUUID(), clientId, promoId, matchType: "model" });
  }

  if (coll) {
    for (const entry of index.entries) {
      if (!matched.has(entry.id) && entry.collections.has(coll)) {
        matches.push({ id: randomUUID(), clientId: entry.id, promoId, matchType: "collection" });
        matched.add(entry.id);
      }
    }
  }

  if (matches.length > 0) {
    tx.insert(promoMatches).values(matches).run();
  }
  // Client IDs matched to this promo (≤1 row per client/promo via the
  // unique constraint). Callers may union these for distinct-client counts.
  return matches.map((m) => m.clientId);
}

/** The client columns buildPromoClientIndex needs. */
export const promoIndexColumns = {
  id: clients.id,
  productsOfInterest: clients.productsOfInterest,
  status: clients.status,
  deletedAt: clients.deletedAt,
};

/**
 * Drop the given clients' promo matches and rebuild them from the current
 * catalog state against all active promos. Cheap re-index over only the
 * affected clients — call after any catalog mutation that could change a
 * cataloged model's derived collection/brand. Reads the clients inside `tx`,
 * so interests rewritten earlier in the same transaction are what's matched.
 */
export function rematchClientPromos(tx: Tx, clientIds: string[]): void {
  if (clientIds.length === 0) return;
  tx.delete(promoMatches).where(inArray(promoMatches.clientId, clientIds)).run();
  const rows = tx.select(promoIndexColumns).from(clients).where(inArray(clients.id, clientIds)).all();
  const index = buildPromoClientIndex(rows, getCatalogIndex());
  const promos = tx.select().from(promoWatches).all();
  for (const promo of promos) {
    matchPromoToClients(tx, promo.id, promo.modelNumber, promo.collection, index);
  }
}
