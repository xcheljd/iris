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
}
