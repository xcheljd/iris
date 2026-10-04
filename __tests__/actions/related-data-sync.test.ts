import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { activityEvents, bannedCustomers, clients, clientTags, modelCatalog, outreachLogs, outreachTemplates, promoMatches, promoWatches, smartLists } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { banClient, createPromo, createTag, createTemplate, deleteTag, deleteTemplate, unbanClient } from "@/lib/actions";
import { importCatalogRvx } from "@/lib/actions/catalog-import";
import { bulkBanClients } from "@/lib/actions/bulk-clients";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const mgr: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

function rvx(style: string, sub: string) {
  return `<Workbook xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet><Table>
<Row><Cell ss:Index="3"><Data>Class Code</Data></Cell><Cell><Data>Sub-Class Code</Data></Cell><Cell ss:Index="6"><Data>Vendor Style</Data></Cell><Cell ss:Index="33"><Data>Retail Price</Data></Cell></Row>
<Row><Cell ss:Index="3"><Data>ASH-ASHFORD</Data></Cell><Cell><Data>${sub}</Data></Cell><Cell ss:Index="6"><Data>${style}</Data></Cell><Cell ss:Index="33"><Data>500</Data></Cell></Row>
</Table></Worksheet></Workbook>`;
}

// Regressions (m11): writes that left related rows stale.
describe("related data stays in sync on writes", () => {
  const ids = { clients: [] as string[], promos: [] as string[], models: [] as string[], lists: [] as string[], tags: [] as string[], templates: [] as string[], logs: [] as string[] };

  beforeEach(() => vi.mocked(getServerSession).mockResolvedValue(mgr as never));
  afterEach(() => {
    if (ids.logs.length) db.delete(outreachLogs).where(inArray(outreachLogs.id, ids.logs)).run();
    if (ids.promos.length) {
      db.delete(promoMatches).where(inArray(promoMatches.promoId, ids.promos)).run();
      db.delete(promoWatches).where(inArray(promoWatches.id, ids.promos)).run();
    }
    if (ids.clients.length) {
      db.delete(activityEvents).where(inArray(activityEvents.clientId, ids.clients)).run();
      db.delete(bannedCustomers).where(inArray(bannedCustomers.customerId, ids.clients)).run();
      db.delete(promoMatches).where(inArray(promoMatches.clientId, ids.clients)).run();
      db.delete(clients).where(inArray(clients.id, ids.clients)).run();
    }
    if (ids.models.length) db.delete(modelCatalog).where(inArray(modelCatalog.model, ids.models)).run();
    if (ids.lists.length) db.delete(smartLists).where(inArray(smartLists.id, ids.lists)).run();
    if (ids.tags.length) db.delete(clientTags).where(inArray(clientTags.name, ids.tags)).run();
    if (ids.templates.length) db.delete(outreachTemplates).where(inArray(outreachTemplates.name, ids.templates)).run();
    for (const list of Object.values(ids)) list.length = 0;
  });

  const addClient = (model: string, status: "active" | "banned" = "active") => {
    const id = randomUUID();
    ids.clients.push(id);
    db.insert(clients).values({
      id, firstName: "Sync", employeeId: MANAGER_ID, status,
      productsOfInterest: [{ model, collection: null, brand: null, intent: "promo" }],
    }).run();
    return id;
  };
  const addPromo = async (model: string, collection: string) => {
    await createPromo(model, collection, "Ashford");
    ids.models.push(model);
    const id = db.select().from(promoWatches).where(eq(promoWatches.modelNumber, model)).get()!.id;
    ids.promos.push(id);
    return id;
  };
  const matched = (promoId: string, clientId: string) =>
    !!db.select().from(promoMatches).where(and(eq(promoMatches.promoId, promoId), eq(promoMatches.clientId, clientId))).get();

  it("deleting a tag keeps smart lists filtering on their surviving tags", async () => {
    const ts = Date.now();
    const [gone, kept] = [`SyncGone${ts}`, `SyncKept${ts}`];
    ids.tags.push(gone, kept);
    await createTag(gone, "blue");
    await createTag(kept, "blue");
    const [both, legacy] = [randomUUID(), randomUUID()];
    ids.lists.push(both, legacy);
    db.insert(smartLists).values({ id: both, name: "Both", ownerId: MANAGER_ID, filters: { tags: [gone, kept], tagMode: "all" } }).run();
    db.insert(smartLists).values({ id: legacy, name: "Legacy", ownerId: MANAGER_ID, filters: { tag: gone, heat: ["hot"] } }).run();

    const tagId = db.select().from(clientTags).where(eq(clientTags.name, gone)).get()!.id;
    expect(await deleteTag(tagId)).toBeUndefined();

    const filtersOf = (id: string) => db.select().from(smartLists).where(eq(smartLists.id, id)).get()!.filters;
    expect(filtersOf(both)).toEqual({ tags: [kept], tagMode: "all" });
    expect(filtersOf(legacy)).toEqual({ heat: ["hot"] });
  });

  it("a catalog import re-matches promos for clients whose model changed collection", async () => {
    const ts = Date.now();
    const model = `SYNCM-${ts}`;
    const collection = `SYNCC${ts}`;
    ids.models.push(model);
    db.insert(modelCatalog).values({ model, collection: "OLDCOLL", source: "manual" }).run();
    const client = addClient(model);
    // Collection-only promo: the client's interest resolves to OLDCOLL, so no match yet.
    const promo = await addPromo(`SYNCP-${ts}`, collection);
    expect(matched(promo, client)).toBe(false);

    const res = await importCatalogRvx(rvx(model, `SUT-${collection}`));
    expect(res).toMatchObject({ updated: 1 });
    expect(matched(promo, client)).toBe(true);
  });

  it("deleting a template clears outreach logs' references to it", async () => {
    const name = `SyncTpl${Date.now()}`;
    ids.templates.push(name);
    await createTemplate(name, "body", null, "text");
    const tplId = db.select().from(outreachTemplates).where(eq(outreachTemplates.name, name)).get()!.id;
    const client = addClient(`SYNCT-${Date.now()}`);
    const logId = randomUUID();
    ids.logs.push(logId);
    db.insert(outreachLogs).values({ id: logId, clientId: client, employeeId: MANAGER_ID, method: "text", outcome: "responded", templateId: tplId }).run();

    await deleteTemplate(tplId);
    expect(db.select().from(outreachLogs).where(eq(outreachLogs.templateId, tplId)).all()).toEqual([]);
    expect(db.select().from(outreachLogs).where(eq(outreachLogs.id, logId)).get()!.templateId).toBeNull();
  });

  it("banned clients don't get promo matches", async () => {
    const model = `SYNCB-${Date.now()}`;
    const active = addClient(model);
    const banned = addClient(model, "banned");
    const promo = await addPromo(model, `SYNCBC${Date.now()}`);
    expect(matched(promo, active)).toBe(true);
    expect(matched(promo, banned)).toBe(false);
  });

  // Regression: banning left the client's existing promo_matches rows behind.
  // Read paths filter banned clients out, but the rows lingered.
  it("banning a client deletes their existing promo matches", async () => {
    const model = `SYNCX-${Date.now()}`;
    const client = addClient(model);
    const promo = await addPromo(model, `SYNCXC${Date.now()}`);
    expect(matched(promo, client)).toBe(true);

    expect(await banClient(client, "Reselling", "flipping stock")).toBeUndefined();
    expect(matched(promo, client)).toBe(false);
  });

  it("bulk-banning clients deletes their existing promo matches", async () => {
    const model = `SYNCY-${Date.now()}`;
    const [a, b] = [addClient(model), addClient(model)];
    const promo = await addPromo(model, `SYNCYC${Date.now()}`);
    expect(matched(promo, a) && matched(promo, b)).toBe(true);

    expect((await bulkBanClients([a, b], "Other", "bulk")).ok).toBe(2);
    expect(matched(promo, a)).toBe(false);
    expect(matched(promo, b)).toBe(false);
  });

  // Regression: banning deletes a client's promo matches, and unbanning left
  // them matchless until some promo or catalog change re-ran matching.
  it("unbanning a client rebuilds their promo matches", async () => {
    const ts = Date.now();
    const model = `SYNCU-${ts}`;
    const eligible = addClient(model);
    const ineligible = addClient(`SYNCN-${ts}`);
    const promo = await addPromo(model, `SYNCUC${ts}`);
    expect(matched(promo, eligible)).toBe(true);

    expect(await banClient(eligible, "Reselling", "flipping stock")).toBeUndefined();
    expect(await banClient(ineligible, "Other", "no match")).toBeUndefined();
    expect(matched(promo, eligible)).toBe(false);

    expect(await unbanClient(eligible)).toBeUndefined();
    expect(await unbanClient(ineligible)).toBeUndefined();
    expect(matched(promo, eligible)).toBe(true);
    expect(db.select().from(promoMatches).where(eq(promoMatches.clientId, ineligible)).all()).toEqual([]);
  });
});
