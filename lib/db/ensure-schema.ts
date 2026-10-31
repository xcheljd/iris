import type Database from "better-sqlite3";

/** The promo table's name before it became `promo_items`. */
export const LEGACY_PROMO_TABLE = "promo_watches";

/**
 * One-time rename of the promo table to `promo_items` in databases (and
 * restored backups) made before the rename. Runs first on every boot, and in
 * `scripts/drop-fts.mjs` before `drizzle-kit push`, so push never sees an
 * unknown table. SQLite's RENAME also repoints promo_matches' foreign key and
 * the FTS triggers' bodies; the one trigger named after the old table is
 * dropped so FTS setup recreates it under its new name instead of keeping
 * both. If a push already made an empty `promo_items` next to the old table,
 * the empty one gives way; if both hold rows, nothing is touched.
 */
export function renameLegacyPromoTable(sqlite: Database.Database) {
  const has = (name: string) =>
    !!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  if (!has(LEGACY_PROMO_TABLE)) return;
  const tx = sqlite.transaction(() => {
    if (has("promo_items")) {
      const rows = (sqlite.prepare("SELECT COUNT(*) AS n FROM promo_items").get() as { n: number }).n;
      if (rows > 0) {
        console.warn(`[db] both ${LEGACY_PROMO_TABLE} and promo_items hold rows; leaving them as they are`);
        return;
      }
      sqlite.exec("DROP TABLE promo_items");
    }
    sqlite.exec(`DROP TRIGGER IF EXISTS ${LEGACY_PROMO_TABLE}_fts_after_update`);
    sqlite.exec(`ALTER TABLE ${LEGACY_PROMO_TABLE} RENAME TO promo_items`);
  });
  tx();
}

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

  // A pending conflict whose proposed collection is the row's own collection
  // (any capitals) isn't a conflict: drop it, so the review card never asks
  // "SHORELINE or SHORELINE?". recordModelCollection never records one; older
  // sample databases had one.
  sqlite.exec(`
    UPDATE model_catalog SET flagged_collection = NULL, flagged_source = NULL, flagged_at = NULL
    WHERE flagged_collection IS NOT NULL AND upper(trim(flagged_collection)) = upper(trim(collection))
  `);
}

/**
 * Idempotent self-heal for the clients.preferred_contact column
 * (required at the validation layer; nullable in the DB). Same
 * pragma_table_info guard pattern as fts-setup.ts.
 */
export function ensureClientColumns(sqlite: Database.Database) {
  // On a database with no schema yet (fresh clone before `pnpm db:push`),
  // pragma_table_info returns no rows rather than erroring, so the column
  // guard alone would wrongly conclude `preferred_contact` is missing and
  // run ALTER TABLE on a table that doesn't exist. Check the table exists
  // first and no-op when it doesn't — ensureModelCatalog above has already
  // created every app-managed table it knows about; `clients` is
  // drizzle-managed and appears only after a push.
  const tableExists = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='clients'")
    .get();
  if (!tableExists) return;

  const has = sqlite
    .prepare("SELECT 1 FROM pragma_table_info('clients') WHERE name = 'preferred_contact'")
    .get();
  if (!has) {
    sqlite.exec("ALTER TABLE clients ADD COLUMN preferred_contact TEXT");
  }

  // "inactive" is no longer a client status: older databases and restored
  // backups have those clients come back as active. Cheap and idempotent.
  sqlite.exec("UPDATE clients SET status = 'active' WHERE status = 'inactive'");
  sqlite.exec("UPDATE clients SET previous_status = 'active' WHERE previous_status = 'inactive'");
}

/** Promo columns no longer in the schema, dropped from older databases. */
export const RETIRED_PROMO_COLUMNS = ["size_one_qty", "size_two_qty"] as const;

/**
 * Idempotent self-heal for the promo_items brand column (required at
 * validation; nullable in the DB), and drops the retired quantity columns.
 */
export function ensurePromoColumns(sqlite: Database.Database) {
  // Same no-schema guard as ensureClientColumns: on a fresh clone before
  // `pnpm db:push` there is no promo_items table, and pragma_table_info
  // would silently report no columns, triggering an ALTER on a missing table.
  const tableExists = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='promo_items'")
    .get();
  if (!tableExists) return;

  const cols = new Set(
    sqlite
      .prepare("SELECT name FROM pragma_table_info('promo_items')")
      .all()
      .map((r) => (r as { name: string }).name),
  );
  if (!cols.has("brand"))
    sqlite.exec("ALTER TABLE promo_items ADD COLUMN brand TEXT");
  // The quantity columns were retired: stock changes daily in the store's
  // own inventory system, so a hand-kept copy here would always be stale.
  for (const col of RETIRED_PROMO_COLUMNS) if (cols.has(col)) sqlite.exec(`ALTER TABLE promo_items DROP COLUMN ${col}`);
}

/**
 * Idempotent boot-time create for the `meta` key/value table, so an existing
 * DB picks it up without a `pnpm db:push`. Must match `meta` in schema.ts.
 */
export function ensureMetaTable(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
}

/**
 * Boot-time create for the `brands` table (must match `brands` in
 * schema.ts). The first time it runs on a database, it fills the list from
 * the brands already in use, so upgrading keeps every existing brand.
 */
export function ensureBrandsTable(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS brands_name_unique ON brands (name);
  `);
  const done = sqlite.prepare("SELECT 1 FROM meta WHERE key = 'brands_backfilled'").get();
  if (done) return;
  const has = (t: string) => !!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
  const sources: string[] = [];
  if (has("model_catalog")) sources.push("SELECT brand AS b FROM model_catalog");
  if (has("promo_items")) sources.push("SELECT brand AS b FROM promo_items");
  if (has("clients")) {
    sources.push("SELECT json_extract(j.value, '$.brand') AS b FROM clients, json_each(clients.products_of_interest) j");
  }
  const tx = sqlite.transaction(() => {
    if (sources.length) {
      const names = sqlite
        .prepare(`SELECT DISTINCT trim(b) AS name FROM (${sources.join(" UNION ALL ")}) WHERE b IS NOT NULL AND trim(b) != ''`)
        .all() as { name: string }[];
      const seen = new Set<string>();
      const ins = sqlite.prepare("INSERT OR IGNORE INTO brands (id, name) VALUES (lower(hex(randomblob(16))), ?)");
      for (const { name } of names) {
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        ins.run(name);
      }
    }
    sqlite.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('brands_backfilled', '1')").run();
  });
  tx();
}

/**
 * One-time cleanup of promo matches older versions left behind: a logged
 * purchase used to add the buyer as a "model" match whether or not they had
 * that model as an interest, and unsubscribed clients kept their matches.
 * A model match is only ever made from one of the client's own models, so one
 * without such an interest is a leftover. Runs once (meta key), after the
 * tables exist.
 */
export function cleanupPromoMatches(sqlite: Database.Database) {
  const has = (t: string) => !!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
  if (!has("meta") || !has("promo_matches") || !has("clients") || !has("promo_items")) return;
  // Brand matches were dropped from the matcher, but older sample data still
  // carried them. Separate key: databases that already ran the cleanup below
  // still get this one.
  if (!sqlite.prepare("SELECT 1 FROM meta WHERE key = 'promo_brand_matches_cleaned'").get()) {
    sqlite.transaction(() => {
      sqlite.exec("DELETE FROM promo_matches WHERE match_type = 'brand'");
      sqlite.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('promo_brand_matches_cleaned', '1')").run();
    })();
  }
  if (sqlite.prepare("SELECT 1 FROM meta WHERE key = 'promo_matches_cleaned'").get()) return;
  sqlite.transaction(() => {
    sqlite.exec(`
      DELETE FROM promo_matches WHERE match_type = 'model' AND NOT EXISTS (
        SELECT 1 FROM clients c, json_each(c.products_of_interest) j, promo_items w
        WHERE c.id = promo_matches.client_id AND w.id = promo_matches.promo_id
          AND upper(trim(json_extract(j.value, '$.model'))) = w.model_number
      );
      DELETE FROM promo_matches WHERE client_id IN (SELECT id FROM clients WHERE status = 'unsubscribed');
    `);
    sqlite.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('promo_matches_cleaned', '1')").run();
  })();
}
