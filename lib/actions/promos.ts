"use server";
import { db } from "@/lib/db";
import { clients, promoWatches, promoMatches } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireManager } from "./_shared";

interface PromoClientEntry {
  id: string;
  poiLower: string[];
}
interface PromoClientIndex {
  modelMap: Map<string, string[]>; // lowercase poi → clientIds (for O(1) exact model lookup)
  entries: PromoClientEntry[];     // pre-lowercased for collection substring scan
}

function buildPromoClientIndex(
  all: Array<{ id: string; productsOfInterest: string[] | null }>,
): PromoClientIndex {
  const modelMap = new Map<string, string[]>();
  const entries: PromoClientEntry[] = [];
  for (const c of all) {
    const poiLower = (c.productsOfInterest ?? []).map((p) => p.toLowerCase());
    entries.push({ id: c.id, poiLower });
    for (const p of poiLower) {
      const arr = modelMap.get(p);
      if (arr) arr.push(c.id);
      else modelMap.set(p, [c.id]);
    }
  }
  return { modelMap, entries };
}

function matchPromoToClients(
  tx: Pick<typeof db, "insert">,
  promoId: string,
  modelNumber: string,
  collection: string,
  index: PromoClientIndex,
) {
  const modelLower = modelNumber.toLowerCase();
  const collectionLower = collection.toLowerCase();
  const matches: { id: string; clientId: string; promoId: string; matchType: "model" | "collection" }[] = [];

  const modelClientIds = index.modelMap.get(modelLower) ?? [];
  const modelMatchSet = new Set(modelClientIds);
  for (const clientId of modelClientIds) {
    matches.push({ id: randomUUID(), clientId, promoId, matchType: "model" });
  }

  if (collectionLower) {
    for (const entry of index.entries) {
      if (!modelMatchSet.has(entry.id) && entry.poiLower.some((p) => p.includes(collectionLower))) {
        matches.push({ id: randomUUID(), clientId: entry.id, promoId, matchType: "collection" });
      }
    }
  }

  if (matches.length > 0) {
    tx.insert(promoMatches).values(matches).run();
  }
}

export async function createPromo(modelNumber: string, collection: string, msrp?: number | null, discountPercent?: number | null, discountPrice?: number | null) {
  await requireManager();
  if (!modelNumber?.trim() || !collection?.trim()) return { error: "Model number and collection are required" };
  try {
    const all = db.select({ id: clients.id, productsOfInterest: clients.productsOfInterest }).from(clients).all();
    const index = buildPromoClientIndex(all);
    const id = randomUUID();
    db.transaction((tx) => {
      tx.insert(promoWatches).values({ id, modelNumber, collection, msrp: msrp ?? null, discountPercent: discountPercent ?? null, discountPrice: discountPrice ?? null }).run();
      matchPromoToClients(tx, id, modelNumber, collection, index);
    });
    revalidatePath("/promos");
  } catch (err) {
    console.error("createPromo failed:", err);
    return { error: "Failed to create promo" };
  }
}

export async function importPromos(rows: { modelNumber: string; collection: string; msrp?: number | null; discountPercent?: number | null; discountPrice?: number | null }[], promoStart?: string | null, promoEnd?: string | null) {
  await requireManager();
  try {
    const all = db.select({ id: clients.id, productsOfInterest: clients.productsOfInterest }).from(clients).all();
    const index = buildPromoClientIndex(all);
    let imported = 0;
    db.transaction((tx) => {
      for (const row of rows) {
        if (!row.modelNumber?.trim() || !row.collection?.trim()) continue;
        const id = randomUUID();
        const modelNumber = row.modelNumber.trim();
        const collection = row.collection.trim();
        tx.insert(promoWatches).values({
          id,
          modelNumber,
          collection,
          msrp: row.msrp ?? null,
          discountPercent: row.discountPercent ?? null,
          discountPrice: row.discountPrice ?? null,
          promoStart: promoStart ?? null,
          promoEnd: promoEnd ?? null,
        }).run();
        matchPromoToClients(tx, id, modelNumber, collection, index);
        imported++;
      }
    });
    revalidatePath("/promos");
    return { imported };
  } catch (err) {
    console.error("importPromos failed:", err);
    return { error: "Failed to import promos" };
  }
}

export async function clearAllPromos() {
  await requireManager();
  try {
    db.transaction((tx) => {
      tx.delete(promoMatches).run();
      tx.delete(promoWatches).run();
    });
    revalidatePath("/promos");
  } catch (err) {
    console.error("clearAllPromos failed:", err);
    return { error: "Failed to clear promos" };
  }
}

export async function deletePromo(id: string) {
  await requireManager();
  db.transaction((tx) => {
    tx.delete(promoMatches).where(eq(promoMatches.promoId, id)).run();
    tx.delete(promoWatches).where(eq(promoWatches.id, id)).run();
  });
  revalidatePath("/promos");
}
