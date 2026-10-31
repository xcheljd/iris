/**
 * Tag names match ignoring capitals and surrounding spaces, so "vip" picks the
 * existing "VIP" instead of creating a second tag. The first spelling stored
 * wins; later entries reuse it.
 */
export const tagKey = (name: string) => name.trim().toLowerCase();

/** The existing tag that `raw` matches ignoring case, or `raw` trimmed if there's none. */
export function canonicalTagName(raw: string, existing: readonly string[]): string {
  const key = tagKey(raw);
  return existing.find((t) => tagKey(t) === key) ?? raw.trim();
}

/** Canonicalise and de-duplicate a list of tags against the known ones (and each other). */
export function canonicalTagList(raw: readonly string[], existing: readonly string[]): string[] {
  const known = [...existing];
  const out: string[] = [];
  for (const r of raw) {
    if (!r.trim()) continue;
    const name = canonicalTagName(r, known);
    if (!out.some((t) => tagKey(t) === tagKey(name))) out.push(name);
    if (!known.includes(name)) known.push(name);
  }
  return out;
}
