/**
 * SQLite FTS5 setup for the clients full-text index.
 *
 * Idempotent — runs on every app boot and is a no-op when the index already
 * exists. Indexes the user-typed text fields a sales associate might search
 * (name, email, phone, notes, products of interest). Triggers keep the index
 * in lockstep with the `clients` table; a one-time backfill populates rows
 * that existed before the index.
 *
 * Used by both:
 *   • The Clients-page `q` filter (lib/client-filter-conds.ts)
 *   • The global Cmd+K palette (lib/queries.ts `searchClients`)
 */

import type Database from "better-sqlite3";

export function setupClientsFts(sqlite: Database.Database) {
  // Virtual table — porter stemmer + unicode tokenizer with diacritic folding.
  // `client_id UNINDEXED` keeps the id out of the search corpus but available
  // as a join key.
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS clients_fts USING fts5(
      client_id UNINDEXED,
      name,
      email,
      phone,
      notes,
      products,
      tokenize = 'porter unicode61 remove_diacritics 1'
    );
  `);

  // Triggers fire only on changes to indexed columns. Each one deletes the
  // old FTS row (if any) and re-inserts the freshly-projected fields.
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS clients_fts_after_insert
    AFTER INSERT ON clients
    BEGIN
      INSERT INTO clients_fts (client_id, name, email, phone, notes, products)
      VALUES (
        NEW.id,
        TRIM(NEW.first_name || ' ' || COALESCE(NEW.last_name, '')),
        COALESCE(NEW.email, ''),
        COALESCE(NEW.phone, ''),
        COALESCE(NEW.notes, ''),
        COALESCE((SELECT group_concat(value, ' ') FROM json_each(NEW.products_of_interest)), '')
      );
    END;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS clients_fts_after_update
    AFTER UPDATE OF first_name, last_name, email, phone, notes, products_of_interest ON clients
    BEGIN
      DELETE FROM clients_fts WHERE client_id = NEW.id;
      INSERT INTO clients_fts (client_id, name, email, phone, notes, products)
      VALUES (
        NEW.id,
        TRIM(NEW.first_name || ' ' || COALESCE(NEW.last_name, '')),
        COALESCE(NEW.email, ''),
        COALESCE(NEW.phone, ''),
        COALESCE(NEW.notes, ''),
        COALESCE((SELECT group_concat(value, ' ') FROM json_each(NEW.products_of_interest)), '')
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

  // One-time backfill — only inserts rows that aren't in the FTS table yet.
  // The triggers handle everything after this.
  sqlite.exec(`
    INSERT INTO clients_fts (client_id, name, email, phone, notes, products)
    SELECT
      c.id,
      TRIM(c.first_name || ' ' || COALESCE(c.last_name, '')),
      COALESCE(c.email, ''),
      COALESCE(c.phone, ''),
      COALESCE(c.notes, ''),
      COALESCE((SELECT group_concat(value, ' ') FROM json_each(c.products_of_interest)), '')
    FROM clients c
    WHERE c.id NOT IN (SELECT client_id FROM clients_fts);
  `);
}
