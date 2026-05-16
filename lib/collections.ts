// Canonical Meridian collection names. Free-text `productsOfInterest` entries are
// resolved to one of these so the Collections views group by collection rather
// than showing raw model numbers.
export const MERIDIAN_COLLECTIONS = [
  "Solaris",
  "Sentinel Diver",
  "Sentinel",
  "Wentworth",
  "STARCROSS",
  "Octa 770",
  "Octa",
  "Calder",
  "Zenith Point",
  "Cobalt",
  "Lunaris",
  "Signal Sync",
  "Hyperion Steel",
  "VERTEX",
  "NR-710",
  "NR-900",
  "Precision One",
  "Aethon",
  "NEX-100",
  "Horologia",
];

// Longest names first so "Sentinel Diver" wins over "Sentinel" and
// "Octa 770" over "Octa" on substring matches.
const COLLECTIONS_BY_SPECIFICITY = [...MERIDIAN_COLLECTIONS].sort(
  (a, b) => b.length - a.length
);

// Same pattern used to pull model numbers out of free-text product strings.
const MODEL_TOKEN_RE = /[A-Z0-9]+[0-9-]+[A-Z0-9]*/gi;

/**
 * Build a model-number → collection lookup from promo watch rows (the only
 * structured model/collection pairing available in the data model).
 * Keys are upper-cased for case-insensitive lookup.
 */
export function buildModelCollectionMap(
  promos: { modelNumber: string; collection: string }[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of promos) {
    if (p.modelNumber && p.collection) {
      map[p.modelNumber.toUpperCase()] = p.collection;
    }
  }
  return map;
}

/**
 * Resolve a single free-text product string to a collection name, or null if
 * it can't be confidently mapped. Tries a known-collection substring match
 * first, then falls back to a model-number lookup in the promo-watch map.
 */
export function resolveCollection(
  product: string,
  modelMap: Record<string, string>
): string | null {
  const lower = product.toLowerCase();
  for (const collection of COLLECTIONS_BY_SPECIFICITY) {
    if (lower.includes(collection.toLowerCase())) return collection;
  }
  const tokens = product.match(MODEL_TOKEN_RE) || [];
  for (const token of tokens) {
    const hit = modelMap[token.toUpperCase()];
    if (hit) return hit;
  }
  return null;
}

/** Unique, sorted collection names resolved from a list of product strings. */
export function resolveCollections(
  products: string[],
  modelMap: Record<string, string>
): string[] {
  const set = new Set<string>();
  for (const p of products) {
    const c = resolveCollection(p, modelMap);
    if (c) set.add(c);
  }
  return Array.from(set).sort();
}
