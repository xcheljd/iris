"use server";
import { db } from "@/lib/db";
import { modelCatalog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireManager } from "./_shared";
import { parseRvxCatalogXml, type CatalogImportRow } from "@/lib/rvx-catalog-parser";

export type CatalogImportAnalysis = {
  total: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  // Sample of collection changes RVX will overwrite (model: old → new).
  collectionChanges: { model: string; from: string; to: string }[];
  parseErrors: string[];
  // Heuristic narrowness check: how many already-curated models the new
  // file is missing. If high vs the existing curated count, the manager
  // likely ran the report with too narrow a filter (e.g. Client != All).
  prevCuratedCount: number;
  prevCuratedMissingFromFile: number;
};

function diffRow(
  row: CatalogImportRow,
  existing: { collection: string; brand: string | null; msrp: number | null } | undefined,
): "new" | "updated" | "unchanged" {
  if (!existing) return "new";
  if (
    existing.collection !== row.collection ||
    (existing.brand ?? null) !== (row.brand ?? null) ||
    (existing.msrp ?? null) !== (row.msrp ?? null)
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
    })
    .from(modelCatalog)
    .all();
  const m = new Map<string, { collection: string; brand: string | null; msrp: number | null; source: string }>();
  for (const r of rows) m.set(r.model, { collection: r.collection, brand: r.brand ?? null, msrp: r.msrp ?? null, source: r.source });
  return m;
}

export async function analyzeCatalogRvx(
  xmlText: string,
): Promise<CatalogImportAnalysis | { error: string }> {
  await requireManager();
  try {
    const { rows, parseErrors } = parseRvxCatalogXml(xmlText);
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
    return {
      total: rows.length,
      newCount, updatedCount, unchangedCount,
      collectionChanges, parseErrors,
      prevCuratedCount, prevCuratedMissingFromFile,
    };
  } catch (err) {
    console.error("analyzeCatalogRvx failed:", err);
    return { error: "Failed to analyze the catalog file. Please try again." };
  }
}

export async function importCatalogRvx(
  xmlText: string,
): Promise<{ imported: number; created: number; updated: number } | { error: string }> {
  await requireManager();
  try {
    const { rows } = parseRvxCatalogXml(xmlText);
    if (rows.length === 0) return { error: "No catalog rows found in the file." };

    const idx = existingIndex();
    let created = 0, updated = 0;
    const now = new Date();

    db.transaction((tx) => {
      for (const row of rows) {
        const ex = idx.get(row.model);
        if (ex) {
          tx.update(modelCatalog)
            .set({
              collection: row.collection,
              brand: row.brand,
              msrp: row.msrp,
              msrpSeenAt: row.msrp != null ? now : null,
              source: "curated",
              needsReview: false,
              updatedAt: now,
              flaggedCollection: null,
              flaggedSource: null,
              flaggedAt: null,
            })
            .where(eq(modelCatalog.model, row.model))
            .run();
          updated++;
        } else {
          tx.insert(modelCatalog)
            .values({
              model: row.model,
              collection: row.collection,
              brand: row.brand,
              msrp: row.msrp,
              msrpSeenAt: row.msrp != null ? now : null,
              source: "curated",
              needsReview: false,
            })
            .run();
          created++;
        }
      }
    });

    revalidatePath("/catalog");
    revalidatePath("/clients");
    return { imported: created + updated, created, updated };
  } catch (err) {
    console.error("importCatalogRvx failed:", err);
    return { error: "Import failed. Please try again." };
  }
}
