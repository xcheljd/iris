import type Database from "better-sqlite3";

/**
 * Idempotent boot-time DDL for tables drizzle-kit can't manage non-
 * interactively. `drizzle-kit push` prompts "created or renamed?" for
 * model_catalog because the FTS shadow tables aren't in the Drizzle
 * schema, so it can't be run headlessly. We create the table here on
 * every boot instead (same self-healing approach as setupClientsFts).
 *
 * The DDL must stay in lockstep with the `modelCatalog` table in
 * schema.ts so an interactive `drizzle-kit push` (if ever run) sees no
 * diff.
 */
export function ensureModelCatalog(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS model_catalog (
      model TEXT PRIMARY KEY,
      collection TEXT NOT NULL,
      source TEXT NOT NULL,
      first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      brand TEXT,
      msrp REAL,
      msrp_seen_at INTEGER,
      needs_review INTEGER NOT NULL DEFAULT 0,
      flagged_collection TEXT,
      flagged_source TEXT,
      flagged_at INTEGER
    );
  `);

  // Self-healing column adds for DBs created before the flag columns
  // existed (same pragma_table_info guard pattern as fts-setup.ts).
  const cols = new Set(
    sqlite
      .prepare("SELECT name FROM pragma_table_info('model_catalog')")
      .all()
      .map((r) => (r as { name: string }).name),
  );
  if (!cols.has("flagged_collection"))
    sqlite.exec("ALTER TABLE model_catalog ADD COLUMN flagged_collection TEXT");
  if (!cols.has("flagged_source"))
    sqlite.exec("ALTER TABLE model_catalog ADD COLUMN flagged_source TEXT");
  if (!cols.has("flagged_at"))
    sqlite.exec("ALTER TABLE model_catalog ADD COLUMN flagged_at INTEGER");
  if (!cols.has("brand"))
    sqlite.exec("ALTER TABLE model_catalog ADD COLUMN brand TEXT");
  if (!cols.has("msrp"))
    sqlite.exec("ALTER TABLE model_catalog ADD COLUMN msrp REAL");
  if (!cols.has("msrp_seen_at"))
    sqlite.exec("ALTER TABLE model_catalog ADD COLUMN msrp_seen_at INTEGER");
  if (!cols.has("needs_review"))
    sqlite.exec("ALTER TABLE model_catalog ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0");
}

/**
 * Idempotent self-heal for the clients.preferred_contact column
 * (required at the validation layer; nullable in the DB). Same
 * pragma_table_info guard pattern as fts-setup.ts.
 */
export function ensureClientColumns(sqlite: Database.Database) {
  const has = sqlite
    .prepare("SELECT 1 FROM pragma_table_info('clients') WHERE name = 'preferred_contact'")
    .get();
  if (!has) {
    sqlite.exec("ALTER TABLE clients ADD COLUMN preferred_contact TEXT");
  }
}

/**
 * Idempotent self-heal for the promo_watches brand + inventory-size
 * columns (brand required at validation; nullable in the DB).
 */
export function ensurePromoColumns(sqlite: Database.Database) {
  const cols = new Set(
    sqlite
      .prepare("SELECT name FROM pragma_table_info('promo_watches')")
      .all()
      .map((r) => (r as { name: string }).name),
  );
  if (!cols.has("brand"))
    sqlite.exec("ALTER TABLE promo_watches ADD COLUMN brand TEXT");
  if (!cols.has("size_one_qty"))
    sqlite.exec("ALTER TABLE promo_watches ADD COLUMN size_one_qty INTEGER NOT NULL DEFAULT 0");
  if (!cols.has("size_two_qty"))
    sqlite.exec("ALTER TABLE promo_watches ADD COLUMN size_two_qty INTEGER NOT NULL DEFAULT 0");
}
