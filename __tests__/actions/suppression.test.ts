import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import {
  activityEvents, bannedCustomers, clients, promoMatches, promoWatches, prospects, rvxImportBatches, unsubscribeList,
} from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createPromo } from "@/lib/actions";
import { getEmailRecipients } from "@/lib/actions/email-recipients";
import { graduateProspectIntoExistingClient } from "@/lib/actions/prospects";
import { getMatchedClients } from "@/lib/queries";
import { POST } from "@/app/api/clients/route";

// M2: the unsubscribe list and banned_customers were only consulted by the
// unsubscribe page itself. Email recipients, matched clients (and its CSV),
// client create and prospect graduation all ignored them.

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206"; // setup.ts
const mgr: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

const tag = randomUUID().slice(0, 8);
// Stored on the lists in lower case, on the records in mixed case.
const UNSUB = `Supp.Unsub.${tag}@Example.com`;
const BANNED = `Supp.Banned.${tag}@Example.com`;
// On the ban list only, with no client record, so create does not 409 on it.
const BANNED_ONLY = `Supp.BannedOnly.${tag}@Example.com`;
const CLEAN = `supp.clean.${tag}@example.com`;
// createPromo stores the normalized (upper-cased) model number.
const model = `SUPP-${tag}`.toUpperCase();

const clientIds: string[] = [];
const unsubId = randomUUID();
const bannedId = randomUUID();
const bannedOnlyId = randomUUID();
const batchId = randomUUID();
const prospectIds: string[] = [];
let promoId = "";

function insertClient(email: string | null, onEmailList = true) {
  const id = randomUUID();
  db.insert(clients).values({
    id, firstName: "Supp", lastName: tag, email, onEmailList, employeeId: MANAGER_ID,
    productsOfInterest: [{ model, collection: null, brand: null, intent: "promo" }],
  }).run();
  clientIds.push(id);
  return id;
}

function insertProspect(email: string) {
  const id = randomUUID();
  db.insert(prospects).values({
    id, rvxCustomerId: `RVX-SUPP-${id.slice(0, 8)}`, rvxStoreId: "100", importBatchId: batchId,
    firstName: "Supp", lastName: tag, email, productsOfInterest: [], status: "active",
  }).run();
  prospectIds.push(id);
  return id;
}

beforeAll(async () => {
  vi.mocked(getServerSession).mockResolvedValue(mgr);
  db.insert(unsubscribeList).values({ id: unsubId, email: UNSUB.toLowerCase() }).run();
  db.insert(bannedCustomers).values({ id: bannedId, firstName: "Supp", email: BANNED.toLowerCase() }).run();
  db.insert(bannedCustomers).values({ id: bannedOnlyId, firstName: "Supp", email: BANNED_ONLY.toLowerCase() }).run();
  db.insert(rvxImportBatches).values({
    id: batchId, reportStartDate: new Date("2025-01-01"), reportEndDate: new Date("2025-12-31"),
    totalRows: 3, importedCount: 3, importedBy: MANAGER_ID,
  }).run();
  insertClient(UNSUB);
  insertClient(BANNED);
  insertClient(CLEAN);
  for (const email of [UNSUB, BANNED, CLEAN]) insertProspect(email);
  await createPromo(model, `SUPPCOL-${tag}`, "Meridian");
  promoId = db.select().from(promoWatches).where(eq(promoWatches.modelNumber, model)).get()!.id;
});

afterAll(() => {
  db.delete(promoMatches).where(eq(promoMatches.promoId, promoId)).run();
  db.delete(promoWatches).where(eq(promoWatches.id, promoId)).run();
  db.delete(prospects).where(inArray(prospects.id, prospectIds)).run();
  db.delete(rvxImportBatches).where(eq(rvxImportBatches.id, batchId)).run();
  db.delete(activityEvents).where(inArray(activityEvents.clientId, clientIds)).run();
  db.delete(clients).where(inArray(clients.id, clientIds)).run();
  db.delete(unsubscribeList).where(eq(unsubscribeList.id, unsubId)).run();
  db.delete(bannedCustomers).where(inArray(bannedCustomers.id, [bannedId, bannedOnlyId])).run();
});

beforeEach(() => vi.mocked(getServerSession).mockResolvedValue(mgr));

describe("suppression list enforcement", () => {
  it("email recipients drop unsubscribed and banned addresses, clients and prospects alike", async () => {
    const { clients: c, prospects: p } = await getEmailRecipients({ contactQ: tag });
    expect(c.emails).toEqual([CLEAN]);
    const ours = p.emails.filter((e) => e.includes(tag));
    expect(ours).toEqual([CLEAN]);
  });

  it("matched clients drop unsubscribed and banned addresses", async () => {
    const emails = (await getMatchedClients())
      .filter((r) => r.promoModel === model)
      .map((r) => r.email);
    expect(emails).toEqual([CLEAN]);
  });

  it("client create keeps a suppressed address off the email list", async () => {
    for (const [email, expected] of [[BANNED_ONLY.toUpperCase(), false], [`supp.new.${tag}@example.com`, true]] as const) {
      const res = await POST(new Request("http://localhost/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: "Supp", lastName: `New-${tag}`, preferredContact: "email", email, onEmailList: true }),
      }));
      expect(res.status).toBe(200);
      const { id } = await res.json();
      clientIds.push(id);
      expect(db.select().from(clients).where(eq(clients.id, id)).get()!.onEmailList).toBe(expected);
    }
  });

  it("graduating into an existing client does not put a suppressed address on the list", async () => {
    const clientId = insertClient(null, true);
    const prospectId = insertProspect(UNSUB);
    expect(await graduateProspectIntoExistingClient(prospectId, clientId, { email: UNSUB })).toBeUndefined();
    const row = db.select().from(clients).where(eq(clients.id, clientId)).get()!;
    expect(row.email).toBe(UNSUB);
    expect(row.onEmailList).toBe(false);
  });
});
