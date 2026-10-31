"use server";
import { db } from "@/lib/db";
import { clients, promoItems, promoMatches, modelCatalog, type Brand } from "@/lib/db/schema";
import { getBrandNames, addBrandsTx } from "@/lib/brands";
import { cleanBrandNames } from "@/lib/new-brands";
import { canonicalBrand, closestBrand } from "@/lib/brand-match";
import { suggestBrand, buildCollectionBrands, type BrandSuggestion } from "@/lib/brand-suggest";
import { eq, inArray, sql } from "drizzle-orm";
import { rowKeyOf } from "@/lib/import-grid";
import { isPromoEnded } from "@/lib/promo-active";
import { currentPromoPeriod } from "@/lib/queries";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireManager } from "./_shared";
import { recordModelCollection, getCatalogIndex, getCatalogIndexWithMsrp } from "./model-catalog";
import { buildPromoClientIndex, matchPromoToClients, promoIndexColumns } from "@/lib/promo-match";
import { normalizeModel } from "@/lib/normalize";
import { promoNumbersSchema, promoPeriodSchema } from "@/lib/validation/promo";
import { fillDiscount, priceIssues } from "@/lib/promo-import-parser";

export async function createPromo(
  modelNumber: string,
  collection: string,
  brand: Brand,
  msrp?: number | null,
  discountPercent?: number | null,
  discountPrice?: number | null,
  /** The promo's dates. Omitted = it joins the current promo; required when none is running. */
  period?: { promoStart: string | null; promoEnd: string | null },
) {
  await requireManager();
  const dates = period ?? currentPromoPeriod();
  if (!dates) return { error: "No promo is running — pick the promo dates" };
  const checked = promoPeriodSchema.safeParse(dates);
  if (!checked.success) return { error: checked.error.issues[0]?.message ?? "Invalid promo period" };
  // Same model shape importPromos writes, so the two paths match one catalog key.
  const model = normalizeModel(modelNumber);
  if (!model || !collection?.trim()) return { error: "Model number and collection are required" };
  const known = canonicalBrand(brand, getBrandNames());
  if (!known) return { error: brand ? `"${brand}" isn't in the brand list (Settings → Brands)` : "Brand is required" };
  brand = known;
  const nums = promoNumbersSchema.safeParse({ msrp: msrp ?? null, discountPercent: discountPercent ?? null, discountPrice: discountPrice ?? null });
  if (!nums.success) return { error: nums.error.issues[0]?.message ?? "Invalid promo values" };
  try {
    const all = db.select(promoIndexColumns).from(clients).all();
    const index = buildPromoClientIndex(all, getCatalogIndex());
    const id = randomUUID();
    db.transaction((tx) => {
      tx.insert(promoItems).values({ id, modelNumber: model, collection, brand, ...nums.data, ...checked.data }).run();
      recordModelCollection(tx, model, collection, "promo");
      // A promo that has already ended is history: nobody gets matched to it.
      if (!isPromoEnded(checked.data.promoEnd)) matchPromoToClients(tx, id, model, collection, index);
    });
    revalidatePath("/promos");
  } catch (err) {
    console.error("createPromo failed:", err);
    return { error: "Failed to create promo" };
  }
}

/**
 * Per-row import input. `brand` is optional — when present it's the manager's
 * assignment for a row the catalog has no brand for (the dialog's brand picker). The
 * catalog still wins over it when the model is known.
 */
export interface PromoImportRow {
  modelNumber: string;
  collection: string;
  brand?: Brand | null;
  /** True when `brand` is a suggestion the manager kept without changing it. */
  brandSuggested?: boolean;
  msrp?: number | null;
  discountPercent?: number | null;
  discountPrice?: number | null;
}

/**
 * Resolution status for a parsed row. `ready` rows have everything they
 * need; the others surface in the preview as warnings or hints.
 */
/** A promo already in Iris, shown beside an imported row for the same model + dates. */
export interface ExistingPromo {
  id: string;
  modelNumber: string;
  collection: string;
  brand: string | null;
  msrp: number | null;
  discountPercent: number | null;
  discountPrice: number | null;
  promoStart: string | null;
  promoEnd: string | null;
}

export interface ResolvedPromoRow {
  /** The row's place in the file ("Vellamy#7"), unique per row — duplicates share a model. */
  rowKey: string;
  modelNumber: string;       // uppercase
  fileCollection: string;
  fileMsrp: number | null;
  discountPercent: number | null;
  discountPrice: number | null;
  catalogBrand: Brand | null;
  catalogCollection: string | null;
  catalogMsrp: number | null;
  // Effective values to write — catalog wins, the file fills the gaps.
  effectiveBrand: Brand | null;
  effectiveCollection: string;
  effectiveMsrp: number | null;
  // True when the catalog has no entry OR its brand is null. Such rows
  // import with brand=null unless the dialog supplies one.
  isUncatalogued: boolean;
  // True when catalog has a collection that disagrees with the file
  // (case-insensitive). Hint only — the catalog value is used.
  collectionMismatch: boolean;
  // True when the file MSRP is below the catalog's MSRP — usually a parser
  // error or an HQ typo. Surfaced for review; doesn't block import.
  msrpLow: boolean;
  /** Price problems against the effective MSRP (sale ≥ MSRP, sale vs % disagree, tiny %). */
  priceIssues: string[];
  /** For rows the catalog has no brand for: the suggested brand and why. */
  suggestion: BrandSuggestion;
  /** The sheet's brand (typo-corrected) when it disagrees with the catalog's — the catalog's is used. */
  sheetBrandMismatch: string | null;
}

/** Collection → brands, from every catalog model that has a brand. */
function catalogCollectionBrands() {
  return buildCollectionBrands(
    db.select({ collection: modelCatalog.collection, brand: modelCatalog.brand })
      .from(modelCatalog)
      .where(sql`${modelCatalog.brand} IS NOT NULL`)
      .all(),
  );
}

/**
 * Resolve parsed promo rows against the model catalog without writing
 * anything. Used by the import dialog to render its preview and let the
 * manager pick brands for rows the catalog has no brand for before submitting.
 */
export async function resolvePromoRows(
  rows: {
    modelNumber: string; collection: string; msrp?: number | null; discountPercent?: number | null; discountPrice?: number | null;
    /** The sheet's Brand cell as typed. */
    brandText?: string | null;
    /** The workbook sheet the row came from. */
    sourceSheet?: string | null;
    sourceRow?: number;
  }[],
  /** New brands ticked in the dialog: treated as listed while previewing (nothing is saved). */
  opts: { extraBrands?: string[] } = {},
): Promise<{ resolved: ResolvedPromoRow[]; existing: Record<string, ExistingPromo[]> } | { error: string }> {
  await requireManager();
  try {
    const catalog = getCatalogIndexWithMsrp();
    const brandNames = [...getBrandNames(), ...cleanBrandNames(opts.extraBrands ?? [])];
    const collectionBrands = catalogCollectionBrands();
    const resolved: ResolvedPromoRow[] = [];
    for (const [i, row] of rows.entries()) {
      const model = normalizeModel(row.modelNumber);
      if (!model) continue;
      const fileCollection = (row.collection ?? "").trim();
      const cat = catalog.get(model);
      const catalogBrand = cat?.brand ?? null;
      const catalogCollection = cat?.collection ?? null;
      const catalogMsrp = cat?.msrp ?? null;
      const fileMsrp = row.msrp ?? null;
      const isUncatalogued = !cat || catalogBrand == null;
      const collectionMismatch = !!(catalogCollection && fileCollection &&
        catalogCollection.toUpperCase() !== fileCollection.toUpperCase());
      const msrpLow = fileMsrp != null && catalogMsrp != null && fileMsrp < catalogMsrp;
      const effectiveMsrp = fileMsrp ?? catalogMsrp;
      // A sheet that leaves MSRP blank still gets its missing sale price or
      // discount % computed from the catalog MSRP.
      const filled = fillDiscount(effectiveMsrp, row.discountPrice ?? null, row.discountPercent ?? null);
      resolved.push({
        rowKey: rowKeyOf({ sourceRow: row.sourceRow ?? i + 1, sourceSheet: row.sourceSheet }),
        modelNumber: model,
        fileCollection,
        fileMsrp,
        discountPercent: filled.discountPercent,
        discountPrice: filled.discountPrice,
        catalogBrand,
        catalogCollection,
        catalogMsrp,
        effectiveBrand: catalogBrand,
        effectiveCollection: catalogCollection ?? fileCollection,
        effectiveMsrp,
        isUncatalogued,
        collectionMismatch,
        msrpLow,
        priceIssues: priceIssues(effectiveMsrp, filled.discountPrice, filled.discountPercent),
        suggestion: catalogBrand
          ? { brand: null, source: null, reason: null, conflict: [] }
          : suggestBrand({ brandText: row.brandText, collection: catalogCollection ?? fileCollection, sheetName: row.sourceSheet }, brandNames, collectionBrands),
        sheetBrandMismatch: (() => {
          if (!catalogBrand || !row.brandText?.trim()) return null;
          const sheet = closestBrand(row.brandText, brandNames) ?? row.brandText.trim();
          return sheet.toLowerCase() === catalogBrand.toLowerCase() ? null : sheet;
        })(),
      });
    }
    // Promos already in Iris for these models; the dialog compares their
    // dates with the ones being picked to find duplicates.
    const models = [...new Set(resolved.map((r) => r.modelNumber))];
    const existing: Record<string, ExistingPromo[]> = {};
    if (models.length) {
      for (const p of db.select({
        id: promoItems.id, modelNumber: promoItems.modelNumber, collection: promoItems.collection, brand: promoItems.brand,
        msrp: promoItems.msrp, discountPercent: promoItems.discountPercent, discountPrice: promoItems.discountPrice,
        promoStart: promoItems.promoStart, promoEnd: promoItems.promoEnd,
      }).from(promoItems).where(inArray(promoItems.modelNumber, models)).all()) {
        (existing[p.modelNumber] ??= []).push(p);
      }
    }
    return { resolved, existing };
  } catch (err) {
    console.error("resolvePromoRows failed:", err);
    return { error: "Failed to resolve promo rows" };
  }
}

export async function importPromos(
  rows: PromoImportRow[],
  promoStart?: string | null,
  promoEnd?: string | null,
  /** Also file each assigned brand on its catalog model, so the next import knows it. */
  opts: {
    saveBrandsToCatalog?: boolean;
    /** New brands to add to the brand list before the rows are matched. */
    addBrands?: string[];
    /** Existing promos the manager chose to replace with an imported row. */
    replacePromoIds?: string[];
  } = {},
) {
  await requireManager();
  const period = promoPeriodSchema.safeParse({ promoStart: promoStart ?? null, promoEnd: promoEnd ?? null });
  if (!period.success) return { error: period.error.issues[0]?.message ?? "Invalid promo period" };
  // Duplicates must be decided before importing: one row per model, and a
  // model that already has a promo for these dates only with a replace pick.
  const seen = new Set<string>();
  for (const row of rows) {
    const m = normalizeModel(row.modelNumber);
    if (!m) continue;
    if (seen.has(m)) return { error: `${m} is on more than one row — pick one copy before importing` };
    seen.add(m);
  }
  const replace = new Set(opts.replacePromoIds ?? []);
  if (seen.size) {
    const sameDates = (v: string | null, w: string | null) => (v ?? null) === (w ?? null);
    const clash = db.select({ id: promoItems.id, model: promoItems.modelNumber, start: promoItems.promoStart, end: promoItems.promoEnd })
      .from(promoItems).where(inArray(promoItems.modelNumber, [...seen])).all()
      .filter((p) => sameDates(p.start, period.data.promoStart) && sameDates(p.end, period.data.promoEnd) && !replace.has(p.id));
    if (clash.length) {
      return { error: `${clash.length === 1 ? `${clash[0].model} already has` : `${clash.length} models already have`} a promo for these dates — choose keep or replace before importing` };
    }
  }
  try {
    const all = db.select(promoIndexColumns).from(clients).all();
    const catalog = getCatalogIndexWithMsrp();
    const index = buildPromoClientIndex(all, new Map(
      [...catalog].map(([k, v]) => [k, { collection: v.collection, brand: v.brand }])
    ));
    const toAdd = cleanBrandNames(opts.addBrands ?? []);
    const brandNames = [...getBrandNames(), ...toAdd];
    let imported = 0;
    let brandsAdded = 0;
    let skippedNoModel = 0;
    let brandsSaved = 0;
    const matchedClients = new Set<string>();
    let replaced = 0;
    const ended = isPromoEnded(period.data.promoEnd);
    db.transaction((tx) => {
      brandsAdded = addBrandsTx(tx, toAdd).length;
      if (replace.size) {
        const ids = [...replace];
        tx.delete(promoMatches).where(inArray(promoMatches.promoId, ids)).run();
        replaced = tx.delete(promoItems).where(inArray(promoItems.id, ids)).run().changes;
      }
      for (const row of rows) {
        const model = normalizeModel(row.modelNumber);
        if (!model) { skippedNoModel++; continue; }
        const cat = catalog.get(model);
        const fileCollection = (row.collection ?? "").trim();
        // Catalog is source of truth. Fall back to the file row when the
        // catalog has no entry.
        const effectiveCollection = cat?.collection || fileCollection;
        if (!effectiveCollection) { skippedNoModel++; continue; }
        const effectiveBrand: Brand | null =
          (cat?.brand ?? null) ??
          canonicalBrand(row.brand, brandNames);
        const effectiveMsrp = row.msrp ?? cat?.msrp ?? null;
        const filled = fillDiscount(effectiveMsrp, row.discountPrice ?? null, row.discountPercent ?? null);
        const id = randomUUID();
        tx.insert(promoItems).values({
          id,
          modelNumber: model,
          collection: effectiveCollection,
          brand: effectiveBrand,
          msrp: effectiveMsrp,
          discountPercent: filled.discountPercent,
          discountPrice: filled.discountPrice,
          promoStart: period.data.promoStart,
          promoEnd: period.data.promoEnd,
        }).run();
        // Always record the file's collection so the catalog's
        // disagreement-flag pipeline can fire. recordModelCollection
        // handles the sticky/curated precedence internally.
        if (fileCollection) recordModelCollection(tx, model, fileCollection, "promo");
        // Save the manager's brand on the catalog model (never over a brand
        // the catalog already has). A suggestion kept unchanged is marked for
        // review in the Model Catalog.
        if (opts.saveBrandsToCatalog && effectiveBrand && !cat?.brand) {
          const saved = tx.update(modelCatalog)
            .set({ brand: effectiveBrand, ...(row.brandSuggested ? { needsReview: true } : {}), updatedAt: new Date() })
            .where(sql`${modelCatalog.model} = ${model} AND ${modelCatalog.brand} IS NULL`)
            .run();
          brandsSaved += saved.changes;
        }
        // Match against client interests using the catalog-derived
        // collection (matches what we just wrote).
        // A sheet for a promo that has already ended imports as history, unmatched.
        if (!ended) {
          for (const cid of matchPromoToClients(tx, id, model, effectiveCollection, index)) {
            matchedClients.add(cid);
          }
        }
        imported++;
      }
    });
    revalidatePath("/promos");
    revalidatePath("/", "layout");
    return { imported, matchedClients: matchedClients.size, skippedNoModel, brandsSaved, brandsAdded, replaced };
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
      tx.delete(promoItems).run();
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
  try {
    db.transaction((tx) => {
      tx.delete(promoMatches).where(eq(promoMatches.promoId, id)).run();
      tx.delete(promoItems).where(eq(promoItems.id, id)).run();
    });
    revalidatePath("/promos");
    revalidatePath("/clients");
    revalidatePath("/", "layout");
  } catch (err) {
    console.error("deletePromo failed:", err);
    return { error: "Failed to delete promo" };
  }
}
