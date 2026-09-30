import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";
import { DATABASE_PATH } from "@/lib/constants";
import { setupClientsFts } from "./fts-setup";
import { ensureModelCatalog, ensureClientColumns, ensurePromoColumns, ensureMetaTable } from "./ensure-schema";

const dbPath = path.join(process.cwd(), DATABASE_PATH);
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// Idempotent: creates the clients_fts virtual table + sync triggers if
// absent, and backfills any rows not yet indexed. Safe to call on every
// boot. Wrapped in try/catch in case the clients table doesn't exist yet
// (e.g. first drizzle-kit push before tables are created).
// Idempotent: creates model_catalog if absent. Runs before FTS setup so a
// fresh DB has every app-managed table without any drizzle-kit step.
ensureModelCatalog(sqlite);
ensureClientColumns(sqlite);
ensurePromoColumns(sqlite);
ensureMetaTable(sqlite);

try {
  setupClientsFts(sqlite);
} catch (err) {
  if (process.env.NODE_ENV !== "test") {
    console.warn("[db] FTS5 setup skipped:", err instanceof Error ? err.message : err);
  }
}

/** Writes a consistent point-in-time copy of the live DB to `destPath`.
 *  In WAL mode recent commits live in `iris.db-wal` until a checkpoint, so
 *  copying the main file alone can drop them; the online backup API reads
 *  through the WAL. */
export async function snapshotDatabase(destPath: string): Promise<void> {
  await sqlite.backup(destPath);
}

export { sqlite };
export * from "./schema";
