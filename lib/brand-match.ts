/**
 * Brand-name matching shared by the import parsers, server actions and the
 * import dialogs. Pure functions — the brand list is passed in.
 */

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** "aldermoor" / "ALDERMOOR" / "Aldermoor." → "Aldermoor" when it's in the list; else null. */
export function canonicalBrand(raw: string | null | undefined, list: readonly string[]): string | null {
  const k = key(raw ?? "");
  if (!k) return null;
  return list.find((b) => key(b) === k) ?? null;
}

/** Edit distance where swapping two neighbouring letters ("frod" ↔ "ford") counts as one edit. */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * The listed brand a misspelling most likely means: "Aldremoor" → "Aldermoor",
 * "VELLAMY INC" → "Vellamy". Null when nothing is close, or when two brands are
 * equally close (no guessing between them).
 */
export function closestBrand(raw: string | null | undefined, list: readonly string[]): string | null {
  const exact = canonicalBrand(raw, list);
  if (exact) return exact;
  const k = key(raw ?? "");
  if (k.length < 3) return null;
  // A listed brand the text starts with ("VELLAMY INC", "Aldermoor Watches").
  const prefixed = list.filter((b) => key(b).length >= 3 && k.startsWith(key(b)));
  if (prefixed.length === 1) return prefixed[0];
  let best: string | null = null;
  let bestD = Infinity;
  let tie = false;
  for (const b of list) {
    const d = editDistance(k, key(b));
    if (d < bestD) { best = b; bestD = d; tie = false; }
    else if (d === bestD) tie = true;
  }
  const allowed = Math.max(1, Math.floor(k.length / 4));
  return best && !tie && bestD <= allowed ? best : null;
}
