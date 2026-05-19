import { normalizeModel } from "@/lib/normalize";
import type { CatalogEntry } from "@/lib/actions/model-catalog";

/**
 * Derive-at-read: the catalog is authoritative for a cataloged model's
 * collection AND brand. The POI's stored collection/brand are only used
 * for collection/brand-only interests and uncatalogued-model seeds.
 *
 * `catalog` keys are the stored (uppercase) model; we look up via
 * normalizeModel(poi.model) to match how the catalog stores models.
 */
export function resolveInterest(
  poi: { model: string | null; collection: string | null; brand: string | null },
  catalog: Map<string, CatalogEntry>,
): { collection: string | null; brand: string | null } {
  if (poi.model) {
    const e = catalog.get(normalizeModel(poi.model));
    if (e) return { collection: e.collection, brand: e.brand };
  }
  return { collection: poi.collection ?? null, brand: poi.brand ?? null };
}
