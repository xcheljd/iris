import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { ensureModelCatalog, ensureClientColumns, ensureMetaTable, cleanupPromoMatches, renameLegacyPromoTable, ensurePromoColumns } from "@/lib/db/ensure-schema";
import { setupClientsFts } from "@/lib/db/fts-setup";

describe("ensureModelCatalog", () => {
  it("drops a pending conflict that proposes the row's own collection, keeping real ones", () => {
    const db = new Database(":memory:");
    ensureModelCatalog(db);
    const ins = db.prepare("INSERT INTO model_catalog (model, collection, source, flagged_collection, flagged_source, flagged_at) VALUES (?, ?, 'curated', ?, 'promo', 1)");
    ins.run("SAME", "SHORELINE", "shoreline ");
    ins.run("REAL", "SHORELINE", "SHORELINE DEEP");
    ensureModelCatalog(db);
    const rows = db.prepare("SELECT model, flagged_collection AS f, flagged_source AS s FROM model_catalog ORDER BY model").all();
    expect(rows).toEqual([
      { model: "REAL", f: "SHORELINE DEEP", s: "promo" },
      { model: "SAME", f: null, s: null },
    ]);
  });
});

describe("ensureClientColumns", () => {
  it("turns inactive clients (and an inactive status kept for the trash) into active", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE clients (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'active', previous_status TEXT, preferred_contact TEXT)");
    const ins = db.prepare("INSERT INTO clients (id, status, previous_status) VALUES (?, ?, ?)");
    ins.run("a", "inactive", null);
    ins.run("b", "deleted", "inactive");
    ins.run("c", "banned", null);
    ins.run("d", "deleted", "unsubscribed");
    ensureClientColumns(db);
    ensureClientColumns(db);
    expect(db.prepare("SELECT id, status, previous_status AS p FROM clients ORDER BY id").all()).toEqual([
      { id: "a", status: "active", p: null },
      { id: "b", status: "deleted", p: "active" },
      { id: "c", status: "banned", p: null },
      { id: "d", status: "deleted", p: "unsubscribed" },
    ]);
  });
});

describe("cleanupPromoMatches", () => {
  it("drops brand matches, model matches with no matching interest and unsubscribed clients' matches, once", () => {
    const db = new Database(":memory:");
    ensureMetaTable(db);
    db.exec(`
      CREATE TABLE clients (id TEXT PRIMARY KEY, status TEXT NOT NULL, products_of_interest TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE promo_items (id TEXT PRIMARY KEY, model_number TEXT NOT NULL);
      CREATE TABLE promo_matches (id TEXT PRIMARY KEY, client_id TEXT, promo_id TEXT, match_type TEXT);
      INSERT INTO promo_items VALUES ('p1', 'AD-8404');
      INSERT INTO clients VALUES ('wants', 'active', '[{"model":" ad-8404 ","collection":null}]');
      INSERT INTO clients VALUES ('bought', 'active', '[]');
      INSERT INTO clients VALUES ('coll', 'active', '[{"model":null,"collection":"DRIFTWOOD"}]');
      INSERT INTO clients VALUES ('unsub', 'unsubscribed', '[{"model":"AD-8404"}]');
      INSERT INTO promo_matches VALUES ('m1','wants','p1','model'), ('m2','bought','p1','model'), ('m3','coll','p1','collection'), ('m4','unsub','p1','model'), ('m6','coll','p1','brand');
    `);
    cleanupPromoMatches(db);
    expect(db.prepare("SELECT id FROM promo_matches ORDER BY id").all()).toEqual([{ id: "m1" }, { id: "m3" }]);
    db.exec("INSERT INTO promo_matches VALUES ('m5','bought','p1','model')");
    cleanupPromoMatches(db);
    expect(db.prepare("SELECT count(*) AS n FROM promo_matches").get()).toEqual({ n: 3 });
  });
});

describe("renameLegacyPromoTable", () => {
  /** A database from before the rename: old promo table, a match pointing at it, FTS on. */
  function legacyDb() {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE clients (id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT, email TEXT, phone TEXT,
        notes TEXT, products_of_interest TEXT, last_viewed_at INTEGER);
      CREATE TABLE employees (id TEXT PRIMARY KEY, sort_order INTEGER NOT NULL DEFAULT 0, deleted_at INTEGER);
      CREATE TABLE promo_watches (id TEXT PRIMARY KEY, model_number TEXT NOT NULL, collection TEXT NOT NULL);
      CREATE TABLE promo_matches (id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id),
        promo_id TEXT NOT NULL REFERENCES promo_watches(id), match_type TEXT NOT NULL);
      INSERT INTO clients (id, first_name) VALUES ('c1', 'Ana');
      INSERT INTO promo_watches VALUES ('p1', 'AB-100', 'SOLSTICE');
    `);
    // Build the old-named FTS trigger the way older installs had it.
    db.exec(`CREATE TRIGGER promo_watches_fts_after_update AFTER UPDATE OF model_number ON promo_watches BEGIN SELECT 1; END;`);
    db.exec("INSERT INTO promo_matches VALUES ('m1', 'c1', 'p1', 'model')");
    return db;
  }
  const names = (db: Database.Database, type: string) =>
    (db.prepare("SELECT name FROM sqlite_master WHERE type=? ORDER BY name").all(type) as { name: string }[]).map((r) => r.name);

  it("renames the table, keeping rows and repointing the match foreign key", () => {
    const db = legacyDb();
    renameLegacyPromoTable(db);
    renameLegacyPromoTable(db);
    expect(names(db, "table")).toContain("promo_items");
    expect(names(db, "table")).not.toContain("promo_watches");
    expect(db.prepare("SELECT id, model_number FROM promo_items").all()).toEqual([{ id: "p1", model_number: "AB-100" }]);
    const fk = db.prepare("SELECT \"table\" AS t FROM pragma_foreign_key_list('promo_matches') WHERE \"from\" = 'promo_id'").get();
    expect(fk).toEqual({ t: "promo_items" });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(() => db.exec("INSERT INTO promo_matches VALUES ('m2', 'c1', 'nope', 'model')")).toThrow(/FOREIGN KEY/);
  });

  it("leaves one FTS trigger under the new name, and search still sees promo models", () => {
    const db = legacyDb();
    renameLegacyPromoTable(db);
    setupClientsFts(db);
    const triggers = names(db, "trigger").filter((n) => n.includes("fts_after_update") && n.startsWith("promo"));
    expect(triggers).toEqual(["promo_items_fts_after_update"]);
    db.exec("UPDATE promo_items SET model_number = 'ZX-900' WHERE id = 'p1'");
    expect(db.prepare("SELECT client_id FROM clients_fts WHERE clients_fts MATCH 'ZX'").all()).toEqual([{ client_id: "c1" }]);
  });

  it("drops an empty promo_items made by a push, but never one holding rows", () => {
    const empty = legacyDb();
    empty.exec("CREATE TABLE promo_items (id TEXT PRIMARY KEY, model_number TEXT NOT NULL, collection TEXT NOT NULL)");
    renameLegacyPromoTable(empty);
    expect(empty.prepare("SELECT COUNT(*) AS n FROM promo_items").get()).toEqual({ n: 1 });
    expect(names(empty, "table")).not.toContain("promo_watches");

    const full = legacyDb();
    full.exec("CREATE TABLE promo_items (id TEXT PRIMARY KEY, model_number TEXT NOT NULL, collection TEXT NOT NULL)");
    full.exec("INSERT INTO promo_items VALUES ('p9', 'KEEP-1', 'X')");
    renameLegacyPromoTable(full);
    expect(names(full, "table")).toEqual(expect.arrayContaining(["promo_items", "promo_watches"]));
    expect(full.prepare("SELECT id FROM promo_items").all()).toEqual([{ id: "p9" }]);
  });

  it("does nothing on a database that already uses the new name", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE promo_items (id TEXT PRIMARY KEY)");
    renameLegacyPromoTable(db);
    expect(names(db, "table")).toEqual(["promo_items"]);
  });
});

describe("ensurePromoColumns", () => {
  it("drops the retired quantity columns and keeps every row and value", () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE promo_items (id TEXT PRIMARY KEY, model_number TEXT NOT NULL, collection TEXT NOT NULL, brand TEXT,
      size_one_qty INTEGER NOT NULL DEFAULT 0, size_two_qty INTEGER NOT NULL DEFAULT 0, msrp REAL)`);
    db.exec("INSERT INTO promo_items VALUES ('p1', 'AB-1', 'COL', 'Aldermoor', 3, 1, 450)");
    ensurePromoColumns(db);
    ensurePromoColumns(db);
    const cols = (db.prepare("SELECT name FROM pragma_table_info('promo_items')").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(["id", "model_number", "collection", "brand", "msrp"]);
    expect(db.prepare("SELECT * FROM promo_items").all()).toEqual([{ id: "p1", model_number: "AB-1", collection: "COL", brand: "Aldermoor", msrp: 450 }]);
  });
});
