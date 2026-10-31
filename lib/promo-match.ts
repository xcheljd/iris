import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { db } from "@/lib/db";
import { clients, promoMatches, promoItems, type ProductOfInterest } from "@/lib/db/schema";
import { normalizeModel } from "@/lib/normalize";
import { resolveInterest } from "@/lib/resolve-interest";
import { getCatalogIndex, type CatalogEntry } from "@/lib/actions/model-catalog";
import { promoNotEnded } from "@/lib/promo-active";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type MatchType = "model" | "collection";

// Promo ↔ client matching, extracted so promo create/import and every change
// to a client's interests or status reuse the exact same logic (and so it can
// live outside a "use server" module). Collections are compared
// case-insensitively; models via normalizeModel (uppercase) on both sides.
// Every interest intent (interested / promo / arrival) matches.

interface PromoClientEntry {
  id: string;
  collections: Set<string>;
}
export interface PromoClientIndex {
  modelMap: Map<string, string[]>; // normalized model → clientIds (exact lookup)
  entries: PromoClientEntry[];     // for exact collection match
}

/** Statuses that never get promo matches: nobody contacts these clients about a promo. */
export const NO_MATCH_STATUSES = ["banned", "unsubscribed", "deleted"] as const;

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
    if ((NO_MATCH_STATUSES as readonly string[]).includes(c.status) || c.deletedAt) continue;
    const collections = new Set<string>();
    for (const p of c.productsOfInterest ?? []) {
      const m = normalizeModel(p.model);
      if (m) {
        // A model listed twice on one client still matches once.
        const arr = modelMap.get(m);
        if (!arr) modelMap.set(m, [c.id]);
        else if (!arr.includes(c.id)) arr.push(c.id);
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

/** The clients one promo matches: by exact model first, then by collection. */
export function findPromoMatches(modelNumber: string, collection: string, index: PromoClientIndex): { clientId: string; matchType: MatchType }[] {
  const model = normalizeModel(modelNumber);
  const coll = collection.trim().toUpperCase();
  const out: { clientId: string; matchType: MatchType }[] = [];
  const matched = new Set<string>();
  for (const clientId of model ? index.modelMap.get(model) ?? [] : []) {
    out.push({ clientId, matchType: "model" });
    matched.add(clientId);
  }
  if (coll) {
    for (const entry of index.entries) {
      if (!matched.has(entry.id) && entry.collections.has(coll)) {
        out.push({ clientId: entry.id, matchType: "collection" });
        matched.add(entry.id);
      }
    }
  }
  return out;
}

// Brand-level matches were dropped — they fired indiscriminately for every
// client owning the brand. "Interested in a brand" is now expressed via tags
// (e.g., "Maravista", "Aldermoor") and surfaced through Smart Lists / tag filters,
// not the promo matcher.
/** Insert a new promo's matches. Callers skip this for a promo that has already ended. */
export function matchPromoToClients(
  tx: Pick<typeof db, "insert">,
  promoId: string,
  modelNumber: string,
  collection: string,
  index: PromoClientIndex,
) {
  const matches = findPromoMatches(modelNumber, collection, index).map((m) => ({ id: randomUUID(), promoId, ...m }));
  if (matches.length > 0) tx.insert(promoMatches).values(matches).run();
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
 * Bring the given clients' matches up to date with every promo that hasn't
 * ended: add the missing ones, drop ones that no longer apply, fix a changed
 * match type, and leave the rest alone (so a match keeps its id and date).
 * Matches to promos that have already ended are history and stay untouched.
 * Call after anything that changes a client's interests or whether they can
 * be matched (create, edit, prospect graduation, merge, ban/unban,
 * unsubscribe/resubscribe, restore) and after catalog changes that move a
 * model's collection. Reads the clients inside `tx`, so changes made earlier
 * in the same transaction are what's matched.
 */
export function rematchClientPromos(tx: Tx, clientIds: string[]): void {
  if (clientIds.length === 0) return;
  const rows = tx.select(promoIndexColumns).from(clients).where(inArray(clients.id, clientIds)).all();
  const index = buildPromoClientIndex(rows, getCatalogIndex());
  const running = tx.select({ id: promoItems.id, modelNumber: promoItems.modelNumber, collection: promoItems.collection })
    .from(promoItems).where(promoNotEnded()).all();

  const want = new Map<string, MatchType>(); // `${clientId}|${promoId}` → type
  for (const p of running) {
    for (const m of findPromoMatches(p.modelNumber, p.collection, index)) want.set(`${m.clientId}|${p.id}`, m.matchType);
  }
  const runningIds = new Set(running.map((p) => p.id));
  const have = tx.select({ id: promoMatches.id, clientId: promoMatches.clientId, promoId: promoMatches.promoId, matchType: promoMatches.matchType })
    .from(promoMatches).where(inArray(promoMatches.clientId, clientIds)).all()
    .filter((m) => runningIds.has(m.promoId));

  const stale: string[] = [];
  for (const m of have) {
    const key = `${m.clientId}|${m.promoId}`;
    const type = want.get(key);
    if (!type) stale.push(m.id);
    else if (type !== m.matchType) tx.update(promoMatches).set({ matchType: type }).where(eq(promoMatches.id, m.id)).run();
    want.delete(key);
  }
  if (stale.length) tx.delete(promoMatches).where(inArray(promoMatches.id, stale)).run();
  const add = [...want].map(([key, matchType]) => {
    const [clientId, promoId] = key.split("|");
    return { id: randomUUID(), clientId, promoId, matchType };
  });
  if (add.length) tx.insert(promoMatches).values(add).run();
}

/**
 * A purchase answers the promo for that item: drop the buyer's matches to
 * running promos on the bought model. (Closing the interest itself comes with
 * interest closing; until then a later edit to the client can match again.)
 */
export function clearPurchasedMatches(tx: Tx, clientId: string, purchasedModel: string): void {
  const model = normalizeModel(purchasedModel);
  if (!model) return;
  const ids = tx.select({ id: promoMatches.id }).from(promoMatches)
    .innerJoin(promoItems, eq(promoMatches.promoId, promoItems.id))
    .where(and(eq(promoMatches.clientId, clientId), eq(promoItems.modelNumber, model), promoNotEnded()))
    .all().map((r) => r.id);
  if (ids.length) tx.delete(promoMatches).where(inArray(promoMatches.id, ids)).run();
}
