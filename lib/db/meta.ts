import { eq } from "drizzle-orm";
import { db } from "./index";
import { meta } from "./schema";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export function getMeta(key: string, tx: DbOrTx = db): string | undefined {
  return tx.select({ value: meta.value }).from(meta).where(eq(meta.key, key)).get()?.value;
}

export function setMeta(key: string, value: string, tx: DbOrTx = db): void {
  tx.insert(meta).values({ key, value }).onConflictDoUpdate({ target: meta.key, set: { value } }).run();
}
