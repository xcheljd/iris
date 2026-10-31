import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { brands } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

/** The store's brand names, alphabetical (case-insensitive). Server-only. */
export function getBrandNames(): string[] {
  return db
    .select({ name: brands.name })
    .from(brands)
    .orderBy(sql`lower(${brands.name})`)
    .all()
    .map((r) => r.name);
}

type DbOrTx = Pick<typeof db, "select" | "insert">;

/**
 * Add brands to the list inside an import's transaction, skipping any already
 * listed (any capitals). Names must already be cleaned (`cleanBrandNames`).
 * Returns the names actually added.
 */
export function addBrandsTx(tx: DbOrTx, names: readonly string[]): string[] {
  const have = new Set(tx.select({ name: brands.name }).from(brands).all().map((r) => r.name.toLowerCase()));
  const added: string[] = [];
  for (const name of names) {
    if (have.has(name.toLowerCase())) continue;
    tx.insert(brands).values({ id: randomUUID(), name }).run();
    have.add(name.toLowerCase());
    added.push(name);
  }
  return added;
}
