import { canonicalBrand, closestBrand } from "./brand-match";

/**
 * Brands an import file names that aren't in the store's brand list yet —
 * so a first import into a blank database can build the list instead of
 * dropping every brand. Pure; shared by the promo and catalog imports.
 */

export const MAX_BRAND_NAME = 60;

export interface NewBrand {
  /** The spelling to add (the most common one in the file). */
  name: string;
  /** Rows that use it, in any spelling that differs only by capitals/punctuation. */
  rows: number;
  /**
   * A listed brand, or a more common new one, this is probably a typo of
   * ("Aldremoor" → "Aldermoor"). Such names start unticked.
   */
  closeTo: string | null;
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function findNewBrands(texts: Iterable<string | null | undefined>, listed: readonly string[]): NewBrand[] {
  // key → spelling → count
  const groups = new Map<string, Map<string, number>>();
  for (const raw of texts) {
    const t = (raw ?? "").trim();
    if (!t || t.length > MAX_BRAND_NAME || !key(t) || canonicalBrand(t, listed)) continue;
    const k = key(t);
    if (!groups.has(k)) groups.set(k, new Map());
    const g = groups.get(k)!;
    g.set(t, (g.get(t) ?? 0) + 1);
  }
  const found = [...groups.values()].map((g) => {
    const [name] = [...g.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return { name, rows: [...g.values()].reduce((a, b) => a + b, 0) };
  }).sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name));

  return found.map((b, i) => {
    // Compare only against listed brands and new brands ranked above this one,
    // so of "Aldermoor" ×5 and "Aldremoor" ×1 only the rarer one is the typo.
    const closeTo = closestBrand(b.name, listed) ?? closestBrand(b.name, found.slice(0, i).map((x) => x.name));
    return { ...b, closeTo };
  });
}

/** Clean a list of names to add: trimmed, non-empty, short enough, one per spelling. */
export function cleanBrandNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const t = n.trim();
    if (!t || t.length > MAX_BRAND_NAME || !key(t) || seen.has(key(t))) continue;
    seen.add(key(t));
    out.push(t);
  }
  return out;
}
