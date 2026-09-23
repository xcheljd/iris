/**
 * Regression (B6): phones are stored formatted — "(208) 853-5042" — and every
 * search path compared the raw column, so typing the bare digits a customer
 * reads out ("2088535042") found nothing. FTS indexes a digits-only copy of
 * the phone; the LIKE paths strip formatting when the term is all digits.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { db } from "@/lib/db";
import { clients, prospects, rvxImportBatches } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getClientsWithEmployeePaginated, searchClients, listProspects, searchProspects } from "@/lib/queries";
import { setupClientsFts } from "@/lib/db/fts-setup";

const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";
const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const PHONE = "(208) 853-5042";
const DIGITS = "2088535042";

const clientId = randomUUID();
const prospectId = randomUUID();
const batchId = randomUUID();

beforeAll(() => {
  db.insert(clients).values({ id: clientId, firstName: "Dial", lastName: "Tone", phone: PHONE, employeeId: ASSOCIATE_ID }).run();
  db.insert(rvxImportBatches).values({
    id: batchId, reportStartDate: new Date(), reportEndDate: new Date(), totalRows: 1, importedCount: 1, importedBy: MANAGER_ID,
  }).run();
  db.insert(prospects).values({
    id: prospectId, rvxCustomerId: "B6-DIGITS", rvxStoreId: "001", importBatchId: batchId, firstName: "Ring", lastName: "Back", phone: PHONE,
  }).run();
});

afterAll(() => {
  db.delete(clients).where(eq(clients.id, clientId)).run();
  db.delete(prospects).where(eq(prospects.id, prospectId)).run();
  db.delete(rvxImportBatches).where(eq(rvxImportBatches.id, batchId)).run();
});

describe("phone search by digits", () => {
  it("finds a formatted client phone via the FTS `q` filter", async () => {
    const { rows } = await getClientsWithEmployeePaginated(undefined, { q: DIGITS });
    expect(rows.map((r) => r.client.id)).toContain(clientId);
  });

  it("finds a formatted client phone via the command palette", async () => {
    const { clients: hits } = await searchClients(DIGITS);
    expect(hits.map((h) => h.id)).toContain(clientId);
  });

  it("finds a formatted client phone via the LIKE contact filter", async () => {
    const { rows } = await getClientsWithEmployeePaginated(undefined, { contactQ: DIGITS });
    expect(rows.map((r) => r.client.id)).toContain(clientId);
    // A partial digit run in the middle of the number matches too.
    const partial = await getClientsWithEmployeePaginated(undefined, { contactQ: "8535" });
    expect(partial.rows.map((r) => r.client.id)).toContain(clientId);
  });

  it("still matches formatted input against the raw column", async () => {
    const { rows } = await getClientsWithEmployeePaginated(undefined, { contactQ: "853-5042" });
    expect(rows.map((r) => r.client.id)).toContain(clientId);
  });

  it("finds a formatted prospect phone in the list and the palette", async () => {
    const { rows } = await listProspects({ q: DIGITS });
    expect(rows.map((r) => r.id)).toContain(prospectId);
    const hits = await searchProspects(DIGITS);
    expect(hits.map((h) => h.id)).toContain(prospectId);
  });
});

describe("setupClientsFts migration", () => {
  it("rebuilds an index built with the old raw-phone projection", () => {
    const mem = new Database(":memory:");
    mem.exec(`
      CREATE TABLE employees (id TEXT PRIMARY KEY);
      CREATE TABLE clients (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, email TEXT, phone TEXT, notes TEXT, products_of_interest TEXT DEFAULT '[]');
      CREATE TABLE promo_watches (id TEXT PRIMARY KEY, model_number TEXT, collection TEXT);
      CREATE TABLE promo_matches (client_id TEXT, promo_id TEXT);
      CREATE VIRTUAL TABLE clients_fts USING fts5(client_id UNINDEXED, name, email, phone, notes, products, promos, tokenize = 'porter unicode61 remove_diacritics 1');
      CREATE TRIGGER clients_fts_after_insert AFTER INSERT ON clients BEGIN
        INSERT INTO clients_fts (client_id, name, email, phone, notes, products, promos)
        VALUES (NEW.id, NEW.first_name, '', COALESCE(NEW.phone, ''), '', '', '');
      END;
      INSERT INTO clients (id, first_name, phone) VALUES ('c1', 'Old', '${PHONE}');
    `);
    const count = () => (mem.prepare(`SELECT count(*) AS n FROM clients_fts WHERE clients_fts MATCH '"${DIGITS}"*'`).get() as { n: number }).n;
    expect(count()).toBe(0);

    setupClientsFts(mem);
    expect(count()).toBe(1);

    // Idempotent: a second boot keeps the index (no duplicate rows).
    setupClientsFts(mem);
    expect(count()).toBe(1);
    mem.close();
  });
});
