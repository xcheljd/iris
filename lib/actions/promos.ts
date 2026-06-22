"use server";
import { db } from "@/lib/db";
import { clients, promoWatches, promoMatches, BRAND_VALUES, type Brand } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireManager } from "./_shared";
import { recordModelCollection, getCatalogIndex, getCatalogIndexWithMsrp } from "./model-catalog";
import { buildPromoClientIndex, matchPromoToClients } from "@/lib/promo-match";
import { normalizeModel } from "@/lib/normalize";

export async function createPromo(
  modelNumber: string,
  collection: string,
  brand: Brand,
  msrp?: number | null,
  discountPercent?: number | null,
  discountPrice?: number | null,
  sizeOneQty = 0,
  sizeTwoQty = 0,
) {
  await requireManager();
  if (!modelNumber?.trim() || !collection?.trim()) return { error: "Model number and collection are required" };
  if (!brand || !BRAND_VALUES.includes(brand)) return { error: "Brand is required" };
  try {
    const all = db.select({ id: clients.id, productsOfInterest: clients.productsOfInterest }).from(clients).all();
    const index = buildPromoClientIndex(all, getCatalogIndex());
    const id = randomUUID();
    db.transaction((tx) => {
      tx.insert(promoWatches).values({ id, modelNumber, collection, brand, sizeOneQty, sizeTwoQty, msrp: msrp ?? null, discountPercent: discountPercent ?? null, discountPrice: discountPrice ?? null }).run();
      recordModelCollection(tx, modelNumber, collection, "promo");
      matchPromoToClients(tx, id, modelNumber, collection, index);
    });
    revalidatePath("/promos");
  } catch (err) {
    console.error("createPromo failed:", err);
    return { error: "Failed to create promo" };
  }
}

/**
 * Per-row PDF input. `brand` is optional — when present it's the manager's
 * assignment for an uncatalogued row (from the bulk-assign helper). The
 * catalog still wins over it when the model is known.
 */
export interface PromoImportRow {
  modelNumber: string;
  collection: string;
  brand?: Brand | null;
  msrp?: number | null;
  discountPercent?: number | null;
  discountPrice?: number | null;
  sizeOneQty?: number;
  sizeTwoQty?: number;
}

/**
 * Resolution status for a parsed row. `ready` rows have everything they
 * need; the others surface in the preview as warnings or hints.
 */
export interface ResolvedPromoRow {
  modelNumber: string;       // uppercase
  pdfCollection: string;
  pdfMsrp: number | null;
  discountPercent: number | null;
  discountPrice: number | null;
  catalogBrand: Brand | null;
  catalogCollection: string | null;
  catalogMsrp: number | null;
  // Effective values to write — catalog wins, PDF fills the gaps.
  effectiveBrand: Brand | null;
  effectiveCollection: string;
  effectiveMsrp: number | null;
  // True when the catalog has no entry OR its brand is null. Such rows
  // import with brand=null unless the dialog supplies one.
  isUncatalogued: boolean;
  // True when catalog has a collection that disagrees with the PDF
  // (case-insensitive). Hint only — the catalog value is used.
  collectionMismatch: boolean;
  // True when PDF MSRP is below the catalog's MSRP — usually a parser
  // error or an HQ typo. Surfaced for review; doesn't block import.
  msrpLow: boolean;
}

/**
 * Resolve parsed PDF rows against the model catalog without writing
 * anything. Used by the import dialog to render its preview and let the
 * manager bulk-assign brands for uncatalogued rows before submitting.
 */
export async function resolvePromoRows(
  rows: { modelNumber: string; collection: string; msrp?: number | null; discountPercent?: number | null; discountPrice?: number | null }[],
): Promise<{ resolved: ResolvedPromoRow[] } | { error: string }> {
  await requireManager();
  try {
    const catalog = getCatalogIndexWithMsrp();
    const resolved: ResolvedPromoRow[] = [];
    for (const row of rows) {
      const model = normalizeModel(row.modelNumber);
      if (!model) continue;
      const pdfCollection = (row.collection ?? "").trim();
      const cat = catalog.get(model);
      const catalogBrand = cat?.brand ?? null;
      const catalogCollection = cat?.collection ?? null;
      const catalogMsrp = cat?.msrp ?? null;
      const pdfMsrp = row.msrp ?? null;
      const isUncatalogued = !cat || catalogBrand == null;
      const collectionMismatch = !!(catalogCollection && pdfCollection &&
        catalogCollection.toUpperCase() !== pdfCollection.toUpperCase());
      const msrpLow = pdfMsrp != null && catalogMsrp != null && pdfMsrp < catalogMsrp;
      resolved.push({
        modelNumber: model,
        pdfCollection,
        pdfMsrp,
        discountPercent: row.discountPercent ?? null,
        discountPrice: row.discountPrice ?? null,
        catalogBrand,
        catalogCollection,
        catalogMsrp,
        effectiveBrand: catalogBrand,
        effectiveCollection: catalogCollection ?? pdfCollection,
        effectiveMsrp: pdfMsrp ?? catalogMsrp,
        isUncatalogued,
        collectionMismatch,
        msrpLow,
      });
    }
    return { resolved };
  } catch (err) {
    console.error("resolvePromoRows failed:", err);
    return { error: "Failed to resolve promo rows" };
  }
}

export async function importPromos(
  rows: PromoImportRow[],
  promoStart?: string | null,
  promoEnd?: string | null,
) {
  await requireManager();
  try {
    const all = db.select({ id: clients.id, productsOfInterest: clients.productsOfInterest }).from(clients).all();
    const catalog = getCatalogIndexWithMsrp();
    const index = buildPromoClientIndex(all, new Map(
      [...catalog].map(([k, v]) => [k, { collection: v.collection, brand: v.brand }])
    ));
    let imported = 0;
    let skippedNoModel = 0;
    const matchedClients = new Set<string>();
    db.transaction((tx) => {
      for (const row of rows) {
        const model = normalizeModel(row.modelNumber);
        if (!model) { skippedNoModel++; continue; }
        const cat = catalog.get(model);
        const pdfCollection = (row.collection ?? "").trim();
        // Catalog is source of truth. Fall back to PDF/row when the
        // catalog has no entry.
        const effectiveCollection = cat?.collection || pdfCollection;
        if (!effectiveCollection) { skippedNoModel++; continue; }
        const effectiveBrand: Brand | null =
          (cat?.brand ?? null) ??
          (row.brand && BRAND_VALUES.includes(row.brand) ? row.brand : null);
        const effectiveMsrp = row.msrp ?? cat?.msrp ?? null;
        const id = randomUUID();
        tx.insert(promoWatches).values({
          id,
          modelNumber: model,
          collection: effectiveCollection,
          brand: effectiveBrand,
          sizeOneQty: row.sizeOneQty ?? 0,
          sizeTwoQty: row.sizeTwoQty ?? 0,
          msrp: effectiveMsrp,
          discountPercent: row.discountPercent ?? null,
          discountPrice: row.discountPrice ?? null,
          promoStart: promoStart ?? null,
          promoEnd: promoEnd ?? null,
        }).run();
        // Always record the PDF's collection so the catalog's
        // disagreement-flag pipeline can fire. recordModelCollection
        // handles the sticky/curated precedence internally.
        if (pdfCollection) recordModelCollection(tx, model, pdfCollection, "promo");
        // Match against client interests using the catalog-derived
        // collection (matches what we just wrote).
        for (const cid of matchPromoToClients(tx, id, model, effectiveCollection, index)) {
          matchedClients.add(cid);
        }
        imported++;
      }
    });
    revalidatePath("/promos");
    revalidatePath("/", "layout");
    return { imported, matchedClients: matchedClients.size, skippedNoModel };
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
    revalidatePath("/clients");
    revalidatePath("/", "layout");
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
  revalidatePath("/clients");
  revalidatePath("/", "layout");
}
