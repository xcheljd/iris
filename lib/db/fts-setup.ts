/**
 * SQLite FTS5 setup for the clients full-text index.
 *
 * Idempotent — runs on every app boot and is a no-op when the index
 * already exists. Indexes the user-typed text fields a sales associate
 * might search (name, email, phone, notes, products of interest, and the
 * linked-promo collection/model via promo_matches). Triggers keep the
 * index in lockstep with `clients`, `promo_matches`, and `promo_watches`;
 * a one-time backfill populates rows that existed before the index.
 *
 * Prospects are intentionally NOT indexed — they come from RVX imports
 * and rarely carry notes or products-of-interest, so an FTS surface
 * wouldn't earn its keep. The Prospects page keeps its lightweight
 * in-memory name/email/phone filter.
 *
 * Used by:
 *   • The Clients-page `q` filter (lib/client-filter-conds.ts)
 *   • The global Cmd+K palette (lib/queries.ts `searchClients`)
 */

import type Database from "better-sqlite3";

export function setupClientsFts(sqlite: Database.Database) {
  // Self-healing column add: ensures clients.last_viewed_at exists even when
  // the user hasn't run `npm run db:push` after pulling. SQLite's
  // pragma_table_info is queried first because ALTER TABLE ADD COLUMN throws
  // if the column already exists.
  const hasLastViewed = sqlite
    .prepare("SELECT 1 FROM pragma_table_info('clients') WHERE name = 'last_viewed_at'")
    .get();
  if (!hasLastViewed) {
    sqlite.exec("ALTER TABLE clients ADD COLUMN last_viewed_at INTEGER");
  }

  // Schema migration: if clients_fts exists but lacks the `promos` column
  // (added for collection-name search via promo_matches), drop the whole FTS
  // table and its triggers so we can recreate them cleanly. Backfill below
  // will repopulate. This runs at most once per installation.
  const ftsExists = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='clients_fts'")
    .get();
  if (ftsExists) {
    const hasPromosCol = sqlite
      .prepare("SELECT 1 FROM pragma_table_info('clients_fts') WHERE name='promos'")
      .get();
    if (!hasPromosCol) {
      sqlite.exec("DROP TRIGGER IF EXISTS clients_fts_after_insert");
      sqlite.exec("DROP TRIGGER IF EXISTS clients_fts_after_update");
      sqlite.exec("DROP TRIGGER IF EXISTS clients_fts_after_delete");
      sqlite.exec("DROP TRIGGER IF EXISTS promo_matches_after_insert");
      sqlite.exec("DROP TRIGGER IF EXISTS promo_matches_after_delete");
      sqlite.exec("DROP TRIGGER IF EXISTS promo_watches_fts_after_update");
      sqlite.exec("DROP TABLE clients_fts");
    }
  }

  // Virtual table — porter stemmer + unicode tokenizer with diacritic folding.
  // `client_id UNINDEXED` keeps the id out of the search corpus but available
  // as a join key. The `promos` column holds space-joined model_number +
  // collection for every promoMatch the client has, so a search for
  // "DEEPSTONE" finds clients linked via the promo system.
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS clients_fts USING fts5(
      client_id UNINDEXED,
      name,
      email,
      phone,
      notes,
      products,
      promos,
      tokenize = 'porter unicode61 remove_diacritics 1'
    );
  `);

  // Triggers fire only on changes to indexed columns. Each one deletes the
  // old FTS row (if any) and re-inserts the freshly-projected fields.
  // The `promos` field is computed via a sub-select against promo_matches +
  // promo_watches so any change to that join surface refreshes the row.
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS clients_fts_after_insert
    AFTER INSERT ON clients
    BEGIN
      INSERT INTO clients_fts (client_id, name, email, phone, notes, products, promos)
      VALUES (
        NEW.id,
        TRIM(NEW.first_name || ' ' || COALESCE(NEW.last_name, '')),
        COALESCE(NEW.email, ''),
        COALESCE(NEW.phone, ''),
        COALESCE(NEW.notes, ''),
        COALESCE((SELECT group_concat(value, ' ') FROM json_each(NEW.products_of_interest)), ''),
        COALESCE((SELECT group_concat(pw.model_number || ' ' || pw.collection, ' ')
                  FROM promo_matches pm
                  JOIN promo_watches pw ON pw.id = pm.promo_id
                  WHERE pm.client_id = NEW.id), '')
      );
    END;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS clients_fts_after_update
    AFTER UPDATE OF first_name, last_name, email, phone, notes, products_of_interest ON clients
    BEGIN
      DELETE FROM clients_fts WHERE client_id = NEW.id;
      INSERT INTO clients_fts (client_id, name, email, phone, notes, products, promos)
      VALUES (
        NEW.id,
        TRIM(NEW.first_name || ' ' || COALESCE(NEW.last_name, '')),
        COALESCE(NEW.email, ''),
        COALESCE(NEW.phone, ''),
        COALESCE(NEW.notes, ''),
        COALESCE((SELECT group_concat(value, ' ') FROM json_each(NEW.products_of_interest)), ''),
        COALESCE((SELECT group_concat(pw.model_number || ' ' || pw.collection, ' ')
                  FROM promo_matches pm
                  JOIN promo_watches pw ON pw.id = pm.promo_id
                  WHERE pm.client_id = NEW.id), '')
      );
    END;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS clients_fts_after_delete
    AFTER DELETE ON clients
    BEGIN
      DELETE FROM clients_fts WHERE client_id = OLD.id;
    END;
  `);

  // Promo-side triggers: when a client→promo link is added or removed, or
  // when a promo's model_number/collection text changes, recompute the FTS
  // row(s) for the affected clients. Without these, "DEEPSTONE" search
  // would stop matching clients after they're linked to/from a promo.
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS promo_matches_after_insert
    AFTER INSERT ON promo_matches
    BEGIN
      DELETE FROM clients_fts WHERE client_id = NEW.client_id;
      INSERT INTO clients_fts (client_id, name, email, phone, notes, products, promos)
      SELECT
        c.id,
        TRIM(c.first_name || ' ' || COALESCE(c.last_name, '')),
        COALESCE(c.email, ''),
        COALESCE(c.phone, ''),
        COALESCE(c.notes, ''),
        COALESCE((SELECT group_concat(value, ' ') FROM json_each(c.products_of_interest)), ''),
        COALESCE((SELECT group_concat(pw.model_number || ' ' || pw.collection, ' ')
                  FROM promo_matches pm
                  JOIN promo_watches pw ON pw.id = pm.promo_id
                  WHERE pm.client_id = c.id), '')
      FROM clients c
      WHERE c.id = NEW.client_id;
    END;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS promo_matches_after_delete
    AFTER DELETE ON promo_matches
    BEGIN
      DELETE FROM clients_fts WHERE client_id = OLD.client_id;
      INSERT INTO clients_fts (client_id, name, email, phone, notes, products, promos)
      SELECT
        c.id,
        TRIM(c.first_name || ' ' || COALESCE(c.last_name, '')),
        COALESCE(c.email, ''),
        COALESCE(c.phone, ''),
        COALESCE(c.notes, ''),
        COALESCE((SELECT group_concat(value, ' ') FROM json_each(c.products_of_interest)), ''),
        COALESCE((SELECT group_concat(pw.model_number || ' ' || pw.collection, ' ')
                  FROM promo_matches pm
                  JOIN promo_watches pw ON pw.id = pm.promo_id
                  WHERE pm.client_id = c.id), '')
      FROM clients c
      WHERE c.id = OLD.client_id;
    END;
  `);

  // When a promo's text changes, refresh every linked client.
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS promo_watches_fts_after_update
    AFTER UPDATE OF model_number, collection ON promo_watches
    BEGIN
      DELETE FROM clients_fts WHERE client_id IN (SELECT client_id FROM promo_matches WHERE promo_id = NEW.id);
      INSERT INTO clients_fts (client_id, name, email, phone, notes, products, promos)
      SELECT
        c.id,
        TRIM(c.first_name || ' ' || COALESCE(c.last_name, '')),
        COALESCE(c.email, ''),
        COALESCE(c.phone, ''),
        COALESCE(c.notes, ''),
        COALESCE((SELECT group_concat(value, ' ') FROM json_each(c.products_of_interest)), ''),
        COALESCE((SELECT group_concat(pw.model_number || ' ' || pw.collection, ' ')
                  FROM promo_matches pm
                  JOIN promo_watches pw ON pw.id = pm.promo_id
                  WHERE pm.client_id = c.id), '')
      FROM clients c
      WHERE c.id IN (SELECT client_id FROM promo_matches WHERE promo_id = NEW.id);
    END;
  `);

  // One-time backfill — only inserts rows that aren't in the FTS table yet.
  // The triggers handle everything after this.
  sqlite.exec(`
    INSERT INTO clients_fts (client_id, name, email, phone, notes, products, promos)
    SELECT
      c.id,
      TRIM(c.first_name || ' ' || COALESCE(c.last_name, '')),
      COALESCE(c.email, ''),
      COALESCE(c.phone, ''),
      COALESCE(c.notes, ''),
      COALESCE((SELECT group_concat(value, ' ') FROM json_each(c.products_of_interest)), ''),
      COALESCE((SELECT group_concat(pw.model_number || ' ' || pw.collection, ' ')
                FROM promo_matches pm
                JOIN promo_watches pw ON pw.id = pm.promo_id
                WHERE pm.client_id = c.id), '')
    FROM clients c
    WHERE c.id NOT IN (SELECT client_id FROM clients_fts);
  `);
}
