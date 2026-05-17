import { randomUUID } from "crypto";
import type { db } from "@/lib/db";
import { promoMatches, type ProductOfInterest } from "@/lib/db/schema";
import { normalizeModel } from "@/lib/normalize";

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

export function buildPromoClientIndex(
  all: Array<{ id: string; productsOfInterest: ProductOfInterest[] | null }>,
): PromoClientIndex {
  const modelMap = new Map<string, string[]>();
  const entries: PromoClientEntry[] = [];
  for (const c of all) {
    const collections = new Set<string>();
    for (const p of c.productsOfInterest ?? []) {
      const m = normalizeModel(p.model);
      if (m) {
        const arr = modelMap.get(m);
        if (arr) arr.push(c.id);
        else modelMap.set(m, [c.id]);
      }
      if (p.collection) collections.add(p.collection.trim().toUpperCase());
    }
    entries.push({ id: c.id, collections });
  }
  return { modelMap, entries };
}

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
  const modelMatchSet = new Set(modelClientIds);
  for (const clientId of modelClientIds) {
    matches.push({ id: randomUUID(), clientId, promoId, matchType: "model" });
  }

  if (coll) {
    for (const entry of index.entries) {
      if (!modelMatchSet.has(entry.id) && entry.collections.has(coll)) {
        matches.push({ id: randomUUID(), clientId: entry.id, promoId, matchType: "collection" });
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
