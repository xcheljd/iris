"use server";
import { db } from "@/lib/db";
import { clients, promoWatches, promoMatches } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireManager } from "./_shared";
import { recordModelCollection } from "./model-catalog";
import { buildPromoClientIndex, matchPromoToClients } from "@/lib/promo-match";

export async function createPromo(modelNumber: string, collection: string, msrp?: number | null, discountPercent?: number | null, discountPrice?: number | null) {
  await requireManager();
  if (!modelNumber?.trim() || !collection?.trim()) return { error: "Model number and collection are required" };
  try {
    const all = db.select({ id: clients.id, productsOfInterest: clients.productsOfInterest }).from(clients).all();
    const index = buildPromoClientIndex(all);
    const id = randomUUID();
    db.transaction((tx) => {
      tx.insert(promoWatches).values({ id, modelNumber, collection, msrp: msrp ?? null, discountPercent: discountPercent ?? null, discountPrice: discountPrice ?? null }).run();
      recordModelCollection(tx, modelNumber, collection, "promo");
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
        recordModelCollection(tx, modelNumber, collection, "promo");
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
