import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { clientTags } from "@/lib/db/schema";
import { canonicalTagList, tagKey } from "@/lib/tag-names";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Every registered tag name. */
export function registeredTagNames(tx: DbOrTx = db): string[] {
  return tx.select({ name: clientTags.name }).from(clientTags).all().map((r) => r.name);
}

/** Map typed tags onto the registered spellings (ignoring case) and drop duplicates. */
export function canonicalizeTags(raw: readonly string[], tx: DbOrTx = db): string[] {
  return canonicalTagList(raw, registeredTagNames(tx));
}

/**
 * Bring the registry's usage counts in line with a client's tags changing from
 * `before` to `after` (both canonical): +1 for each added tag (registering new
 * ones), -1 for each removed. Used by the client form saves, which used to
 * write tags without touching the registry, so form-made tags never showed up
 * as suggestions.
 */
export function syncTagUsage(before: readonly string[], after: readonly string[], tx: DbOrTx = db): void {
  const had = new Set(before.map(tagKey));
  const has = new Set(after.map(tagKey));
  for (const name of after) {
    if (had.has(tagKey(name))) continue;
    tx.insert(clientTags)
      .values({ id: randomUUID(), name, usageCount: 1 })
      .onConflictDoUpdate({ target: clientTags.name, set: { usageCount: sql`${clientTags.usageCount} + 1` } })
      .run();
  }
  for (const name of before) {
    if (has.has(tagKey(name))) continue;
    tx.update(clientTags)
      .set({ usageCount: sql`CASE WHEN ${clientTags.usageCount} - 1 < 0 THEN 0 ELSE ${clientTags.usageCount} - 1 END` })
      .where(sql`${clientTags.name} = ${name}`)
      .run();
  }
}
