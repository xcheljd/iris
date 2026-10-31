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
 * It also renames the promo table from its old name to `promo_items` (same
 * steps as renameLegacyPromoTable in lib/db/ensure-schema.ts), so push on a
 * database from before the rename sees a known table instead of prompting,
 * and drops the retired promo quantity columns for the same reason.
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
const LEGACY_PROMO_TABLE = "promo_watches";
try {
  const has = (name) => !!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  if (has(LEGACY_PROMO_TABLE)) {
    const newRows = has("promo_items") ? sqlite.prepare("SELECT COUNT(*) AS n FROM promo_items").get().n : 0;
    if (newRows === 0) {
      sqlite.transaction(() => {
        sqlite.exec("DROP TABLE IF EXISTS promo_items");
        sqlite.exec(`DROP TRIGGER IF EXISTS ${LEGACY_PROMO_TABLE}_fts_after_update`);
        sqlite.exec(`ALTER TABLE ${LEGACY_PROMO_TABLE} RENAME TO promo_items`);
      })();
      console.log("[drop-fts] renamed the promo table to promo_items");
    }
  }
  // Retired promo quantity columns (same list as RETIRED_PROMO_COLUMNS in
  // lib/db/ensure-schema.ts), dropped here so push has no data-loss prompt.
  if (has("promo_items")) {
    const cols = new Set(sqlite.prepare("SELECT name FROM pragma_table_info('promo_items')").all().map((r) => r.name));
    for (const col of ["size_one_qty", "size_two_qty"]) if (cols.has(col)) sqlite.exec(`ALTER TABLE promo_items DROP COLUMN ${col}`);
  }
  // Drop triggers first so SQLite doesn't complain about orphaned triggers,
  // then the virtual table (which cascades to its shadow tables).
  sqlite.exec(`
    DROP TRIGGER IF EXISTS clients_fts_after_insert;
    DROP TRIGGER IF EXISTS clients_fts_after_update;
    DROP TRIGGER IF EXISTS clients_fts_after_delete;
    DROP TRIGGER IF EXISTS promo_matches_after_insert;
    DROP TRIGGER IF EXISTS promo_matches_after_delete;
    DROP TRIGGER IF EXISTS promo_matches_after_update;
    DROP TRIGGER IF EXISTS promo_items_fts_after_update;
    DROP TRIGGER IF EXISTS ${LEGACY_PROMO_TABLE}_fts_after_update;
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
