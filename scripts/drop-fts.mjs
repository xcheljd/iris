/**
 * Pre-push cleanup: drop runtime FTS tables before `drizzle-kit push`.
 *
 * The clients FTS virtual table (+ its FTS5 shadow tables) is created at
 * app boot by lib/db/fts-setup.ts and is NOT part of the Drizzle schema
 * (drizzle-kit has no FTS/virtual-table support — see
 * drizzle-team/drizzle-orm#2046). If the app has booted since the last
 * push, `drizzle-kit push` sees those tables as "extra" schema and tries
 * to drop them, which crashes on the FTS5 shadow tables.
 *
 * Dropping them here is safe: they contain only derived index data and
 * are recreated (and backfilled from clients) at next boot.
 *
 * Usage: `node scripts/drop-fts.mjs` — no-op when the tables are absent.
 */
import Database from "better-sqlite3";
import { existsSync } from "node:fs";

const dbPath = process.env.DATABASE_PATH ?? "./data/iris.db";
if (!existsSync(dbPath)) {
  console.log(`[drop-fts] no database at ${dbPath} — nothing to do`);
  process.exit(0);
}

const sqlite = new Database(dbPath);
try {
  // Drop triggers first so SQLite doesn't complain about orphaned triggers,
  // then the virtual table (which cascades to its shadow tables).
  sqlite.exec(`
    DROP TRIGGER IF EXISTS clients_fts_after_insert;
    DROP TRIGGER IF EXISTS clients_fts_after_update;
    DROP TRIGGER IF EXISTS clients_fts_after_delete;
    DROP TRIGGER IF EXISTS promo_matches_after_insert;
    DROP TRIGGER IF EXISTS promo_matches_after_delete;
    DROP TRIGGER IF EXISTS promo_watches_fts_after_update;
    DROP TABLE IF EXISTS clients_fts;
  `);
  const remaining = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'clients_fts%'",
    )
    .all();
  console.log(
    remaining.length
      ? `[drop-fts] dropped clients_fts; remaining: ${remaining
          .map((r) => r.name)
          .join(", ")}`
      : "[drop-fts] dropped clients_fts (and shadow tables)",
  );
} finally {
  sqlite.close();
}
