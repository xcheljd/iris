"use server";
import { db } from "@/lib/db";
import { clients, modelCatalog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireManager } from "./_shared";
import { parseCatalogRows, catalogDuplicates, applyCatalogPicks, type CatalogImportRow } from "@/lib/catalog-import-parser";
import { rowKeyOf } from "@/lib/import-grid";
import { getBrandNames, addBrandsTx } from "@/lib/brands";
import { findNewBrands, cleanBrandNames, type NewBrand } from "@/lib/new-brands";
import { normalizeModel } from "@/lib/normalize";
import { rematchClientPromos } from "@/lib/promo-match";
import { canonicalBrand } from "@/lib/brand-match";
import { suggestBrand, buildCollectionBrands, type BrandSuggestion } from "@/lib/brand-suggest";

/** A file row that would leave its model without a brand: pick one in the dialog. */
export type CatalogBrandRow = {
  model: string;
  collection: string;
  sourceRow: number;
  sourceSheet?: string;
  suggestion: BrandSuggestion;
};

/** The manager's brand for a model the file gives no listed brand. */
export type CatalogBrandAssignment = { brand: string; /** an untouched suggestion */ suggested: boolean };

export type CatalogImportAnalysis = {
  total: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  // Sample of collection changes the import will overwrite (model: old → new).
  collectionChanges: { model: string; from: string; to: string }[];
  parseErrors: string[];
  // Heuristic narrowness check: how many already-curated models the new
  // file is missing. If high vs the existing curated count, the manager
  // likely exported too narrow a list (e.g. one brand or one store).
  prevCuratedCount: number;
  prevCuratedMissingFromFile: number;
  /** Rows that would end up with no brand, with a suggested brand where one fits. */
  brandRows: CatalogBrandRow[];
  /** Brands the file names that aren't in the brand list yet. */
  newBrands: NewBrand[];
  /** Models on more than one row: every copy, plus what the catalog has now. */
  duplicates: CatalogDuplicateGroup[];
};

export type CatalogDuplicateGroup = {
  model: string;
  current: { collection: string; brand: string | null; msrp: number | null } | null;
  copies: { id: string; sourceRow: number; sourceSheet?: string; collection: string; brand: string | null; brandText: string; msrp: number | null }[];
};

// A null brand/msrp in the file means "no information" (blank MSRP or
// brand cell), not "clear it": the import keeps the
// existing value, so it isn't a change either.
function diffRow(
  row: CatalogImportRow,
  existing: { collection: string; brand: string | null; msrp: number | null } | undefined,
): "new" | "updated" | "unchanged" {
  if (!existing) return "new";
  if (
    existing.collection !== row.collection ||
    (row.brand != null && row.brand !== existing.brand) ||
    (row.msrp != null && row.msrp !== existing.msrp)
  )
    return "updated";
  return "unchanged";
}

function existingIndex() {
  const rows = db
    .select({
      model: modelCatalog.model,
      collection: modelCatalog.collection,
      brand: modelCatalog.brand,
      msrp: modelCatalog.msrp,
      source: modelCatalog.source,
      needsReview: modelCatalog.needsReview,
      flaggedCollection: modelCatalog.flaggedCollection,
    })
    .from(modelCatalog)
    .all();
  const m = new Map<string, {
    collection: string; brand: string | null; msrp: number | null; source: string;
    needsReview: boolean; flagged: boolean;
  }>();
  for (const r of rows) {
    m.set(r.model, {
      collection: r.collection, brand: r.brand ?? null, msrp: r.msrp ?? null, source: r.source,
      needsReview: r.needsReview, flagged: r.flaggedCollection != null,
    });
  }
  return m;
}

export async function analyzeCatalogImport(
  text: string,
  /** New brands ticked in the dialog: treated as listed while previewing (nothing is saved). */
  opts: { extraBrands?: string[] } = {},
): Promise<CatalogImportAnalysis | { error: string }> {
  await requireManager();
  try {
    const listed = getBrandNames();
    const brandNames = [...listed, ...cleanBrandNames(opts.extraBrands ?? [])];
    const { rows: allRows, parseErrors } = parseCatalogRows(text, brandNames);
    // Counts and brand rows use one copy per model (the first); duplicates are
    // listed separately for the manager to pick between.
    const dupMap = catalogDuplicates(allRows);
    const rows = allRows.filter((r, i) => allRows.findIndex((x) => x.model === r.model) === i);
    if (rows.length === 0) {
      return { error: parseErrors[0] ?? "No catalog rows found in the file." };
    }
    const idx = existingIndex();
    let newCount = 0, updatedCount = 0, unchangedCount = 0;
    const collectionChanges: CatalogImportAnalysis["collectionChanges"] = [];
    const filModels = new Set<string>();
    for (const row of rows) {
      filModels.add(row.model);
      const ex = idx.get(row.model);
      const d = diffRow(row, ex);
      if (d === "new") newCount++;
      else if (d === "updated") {
        updatedCount++;
        if (ex && ex.collection !== row.collection && collectionChanges.length < 50)
          collectionChanges.push({ model: row.model, from: ex.collection, to: row.collection });
      } else unchangedCount++;
    }
    let prevCuratedCount = 0;
    let prevCuratedMissingFromFile = 0;
    for (const [model, ex] of idx) {
      if (ex.source !== "curated") continue;
      prevCuratedCount++;
      if (!filModels.has(model)) prevCuratedMissingFromFile++;
    }
    // Collection hints come from the catalog plus this file's own branded rows.
    const collectionBrands = buildCollectionBrands([
      ...[...idx.values()].map((e) => ({ collection: e.collection, brand: e.brand })),
      ...allRows.map((r) => ({ collection: r.collection, brand: r.brand })),
    ]);
    const brandRows: CatalogBrandRow[] = rows
      .filter((r) => !(dupMap.get(r.model) ?? [r]).some((c) => c.brand) && !idx.get(r.model)?.brand)
      .map((r) => ({
        model: r.model, collection: r.collection, sourceRow: r.sourceRow,
        ...(r.sourceSheet ? { sourceSheet: r.sourceSheet } : {}),
        suggestion: suggestBrand({ brandText: r.brandText, collection: r.collection, sheetName: r.sourceSheet }, brandNames, collectionBrands),
      }));
    return {
      total: rows.length,
      newCount, updatedCount, unchangedCount,
      collectionChanges, parseErrors,
      prevCuratedCount, prevCuratedMissingFromFile,
      brandRows,
      newBrands: findNewBrands(allRows.map((r) => r.brandText), listed),
      duplicates: [...dupMap].map(([model, copies]) => {
        const ex = idx.get(model);
        return {
          model,
          current: ex ? { collection: ex.collection, brand: ex.brand, msrp: ex.msrp } : null,
          copies: copies.map((c) => ({
            id: rowKeyOf(c), sourceRow: c.sourceRow, ...(c.sourceSheet ? { sourceSheet: c.sourceSheet } : {}),
            collection: c.collection, brand: c.brand, brandText: c.brandText, msrp: c.msrp,
          })),
        };
      }),
    };
  } catch (err) {
    console.error("analyzeCatalogImport failed:", err);
    return { error: "Failed to analyze the catalog file. Please try again." };
  }
}

export async function importCatalog(
  text: string,
  /** Brands picked in the dialog for rows the file gives no listed brand, by model. */
  brandAssignments: Record<string, CatalogBrandAssignment> = {},
  /** New brands to add to the brand list before the rows are matched. */
  opts: {
    addBrands?: string[];
    /** For each model on more than one row: the copy to use (its row key), or SKIP_PICK. */
    duplicatePicks?: Record<string, string>;
  } = {},
): Promise<{ imported: number; created: number; updated: number; brandsAdded: number } | { error: string }> {
  await requireManager();
  try {
    const toAdd = cleanBrandNames(opts.addBrands ?? []);
    const brandNames = [...getBrandNames(), ...toAdd];
    const picked = applyCatalogPicks(parseCatalogRows(text, brandNames).rows, opts.duplicatePicks ?? {});
    if (picked.missing.length) {
      return { error: `${picked.missing.length === 1 ? `${picked.missing[0]} is` : `${picked.missing.length} models are`} on more than one row — pick a copy before importing` };
    }
    const parsed = picked.rows;
    // Apply the dialog's brand picks (listed brands only) to rows with no brand.
    const review = new Set<string>();
    const rows = parsed.map((r) => {
      if (r.brand) return r;
      const pick = brandAssignments[r.model];
      const brand = pick ? canonicalBrand(pick.brand, brandNames) : null;
      if (!brand) return r;
      if (pick.suggested) review.add(r.model);
      return { ...r, brand };
    });
    if (rows.length === 0) return { error: "No catalog rows found in the file." };

    const idx = existingIndex();
    let created = 0, updated = 0, brandsAdded = 0;
    const now = new Date();
    // Models whose catalog collection is new or different: clients
    // interested in them can match different promos now.
    const recollected = new Set<string>();

    db.transaction((tx) => {
      brandsAdded = addBrandsTx(tx, toAdd).length;
      for (const row of rows) {
        const ex = idx.get(row.model);
        if (!ex || ex.collection !== row.collection) recollected.add(row.model);
        if (ex) {
          const changed = diffRow(row, ex) === "updated";
          // Data-identical rows are still rewritten when they aren't clean
          // curated rows yet (promo/manual source, provisional, or a pending
          // flag), so the import keeps promoting them — just not counted.
          if (!changed && ex.source === "curated" && !ex.needsReview && !ex.flagged) continue;
          tx.update(modelCatalog)
            .set({
              collection: row.collection,
              ...(row.brand != null && { brand: row.brand }),
              ...(row.msrp != null && { msrp: row.msrp, msrpSeenAt: now }),
              source: "curated",
              // A kept suggestion is marked for review in the Model Catalog.
              needsReview: review.has(row.model),
              updatedAt: now,
              flaggedCollection: null,
              flaggedSource: null,
              flaggedAt: null,
            })
            .where(eq(modelCatalog.model, row.model))
            .run();
          if (changed) updated++;
        } else {
          tx.insert(modelCatalog)
            .values({
              model: row.model,
              collection: row.collection,
              brand: row.brand,
              msrp: row.msrp,
              msrpSeenAt: row.msrp != null ? now : null,
              source: "curated",
              needsReview: review.has(row.model),
            })
            .run();
          created++;
        }
      }

      // Same re-match a single catalog correction runs, so promo matches
      // aren't stale until the next correction.
      if (recollected.size > 0) {
        const affected = tx.select({ id: clients.id, productsOfInterest: clients.productsOfInterest }).from(clients).all()
          .filter((c) => (c.productsOfInterest ?? []).some((p) => recollected.has(normalizeModel(p.model))))
          .map((c) => c.id);
        rematchClientPromos(tx, affected);
      }
    });

    revalidatePath("/catalog");
    revalidatePath("/clients");
    revalidatePath("/promos");
    return { imported: created + updated, created, updated, brandsAdded };
  } catch (err) {
    console.error("importCatalog failed:", err);
    return { error: "Import failed. Please try again." };
  }
}
