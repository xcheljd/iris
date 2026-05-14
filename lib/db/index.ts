import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";
import { DATABASE_PATH } from "@/lib/constants";
import { setupClientsFts } from "./fts-setup";

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
try {
  setupClientsFts(sqlite);
} catch (err) {
  if (process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.warn("[db] FTS5 setup skipped:", err instanceof Error ? err.message : err);
  }
}

export { sqlite };
export * from "./schema";
