import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { clients, promoWatches, promoMatches, modelCatalog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createPromo, clearAllPromos, correctCatalog, resolveFlag } from "@/lib/actions";
import { recordModelCollection, getCatalogMap, getCatalogIndex } from "@/lib/actions/model-catalog";
import { BRAND_VALUES } from "@/lib/db/schema";
import { clientCreateSchema } from "@/lib/validation/client";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";
const managerSession = { user: { id: MANAGER_ID, name: "Marcus", role: "manager" } };
const associateSession = { user: { id: ASSOCIATE_ID, name: "Jordan", role: "associate" } };

describe("model catalog", () => {
  const promoIds: string[] = [];
  const clientIds: string[] = [];
  const catalogModels: string[] = [];

  beforeEach(() => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as never);
  });

  afterEach(() => {
    for (const id of promoIds) {
      try {
        db.delete(promoMatches).where(eq(promoMatches.promoId, id)).run();
        db.delete(promoWatches).where(eq(promoWatches.id, id)).run();
      } catch { /* ignore */ }
    }
    for (const id of clientIds) {
      try { db.delete(clients).where(eq(clients.id, id)).run(); } catch { /* ignore */ }
    }
    for (const m of catalogModels) {
      try { db.delete(modelCatalog).where(eq(modelCatalog.model, m)).run(); } catch { /* ignore */ }
    }
    promoIds.length = clientIds.length = catalogModels.length = 0;
  });

  it("manual entry for an unknown model creates a provisional needs-review row", () => {
    const model = `CAT-${Date.now()}`;
    catalogModels.push(model);

    recordModelCollection(db, model, "Solaris", "manual");
    expect(getCatalogMap()[model]).toBe("Solaris");
    const row = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(row.source).toBe("manual");
    expect(row.needsReview).toBe(true);
  });

  it("manual entry for a known model is a no-op (no overwrite, no flag)", async () => {
    const model = `MNO-${Date.now()}`;
    catalogModels.push(model);
    await correctCatalog(model, "CURATEDCOLL"); // curated, needsReview=false

    recordModelCollection(db, model, "SOMETHINGELSE", "manual");
    const row = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(row.collection).toBe("CURATEDCOLL"); // unchanged
    expect(row.source).toBe("curated");
    expect(row.needsReview).toBe(false);
    expect(row.flaggedCollection).toBeNull(); // manual never flags
  });

  it("promo overwrites a manual (provisional) row", () => {
    const model = `CAT-${Date.now()}-P`;
    catalogModels.push(model);
    recordModelCollection(db, model, "Solaris", "manual");
    recordModelCollection(db, model, "Sentinel", "promo");
    expect(getCatalogMap()[model]).toBe("Sentinel");
    const row = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(row.source).toBe("promo");
    expect(row.needsReview).toBe(false);
  });

  it("promo does NOT overwrite an existing promo row when they disagree — it flags", () => {
    const model = `CAT-${Date.now()}-PP`;
    catalogModels.push(model);
    recordModelCollection(db, model, "SENTINEL DEEP", "promo");
    const res = recordModelCollection(db, model, "SENTINEL TIDE", "promo");
    expect(res.flagged).toEqual({ model, curated: "SENTINEL DEEP", attempted: "SENTINEL TIDE" });
    const row = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(row.collection).toBe("SENTINEL DEEP"); // unchanged — sticky
    expect(row.flaggedCollection).toBe("SENTINEL TIDE");
    expect(row.flaggedSource).toBe("promo");
  });

  it("promo-vs-promo agreement is a no-op (case-insensitive)", () => {
    const model = `CAT-${Date.now()}-PA`;
    catalogModels.push(model);
    recordModelCollection(db, model, "SENTINEL", "promo");
    const before = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    const res = recordModelCollection(db, model, "sentinel", "promo");
    expect(res).toEqual({});
    const after = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime()); // no write
    expect(after.flaggedCollection).toBeNull();
  });

  it("ignores entries missing model or collection", () => {
    expect(recordModelCollection(db, null, "Solaris", "manual")).toEqual({});
    expect(recordModelCollection(db, "ABC-1", null, "manual")).toEqual({});
  });

  it("survives clearAllPromos", async () => {
    const model = `CAT-${Date.now()}-S`;
    const collection = `COLL-${Date.now()}`;
    catalogModels.push(model);
    await createPromo(model, collection, "Meridian");
    const promo = db.select().from(promoWatches).where(eq(promoWatches.modelNumber, model)).get();
    if (promo) promoIds.push(promo.id);

    expect(getCatalogMap()[model]).toBe(collection);
    await clearAllPromos();
    expect(db.select().from(promoWatches).all()).toHaveLength(0);
    expect(getCatalogMap()[model]).toBe(collection); // catalog untouched
  });

  it("matches a client by exact model and by collection-only interest", async () => {
    const modelClientId = randomUUID();
    const collClientId = randomUUID();
    clientIds.push(modelClientId, collClientId);
    const ts = Date.now();
    const model = `MM-${ts}`;
    const collection = `CC-${ts}`;

    db.insert(clients).values({
      id: modelClientId, firstName: "ModelMatch",
      productsOfInterest: [{ model, collection: null, brand: null, intent: "interested" }],
    }).run();
    db.insert(clients).values({
      id: collClientId, firstName: "CollMatch",
      productsOfInterest: [{ model: null, collection, brand: null, intent: "interested" }],
    }).run();

    await createPromo(model, collection, "Meridian");
    const promo = db.select().from(promoWatches).where(eq(promoWatches.modelNumber, model)).get()!;
    promoIds.push(promo.id);

    const matches = db.select().from(promoMatches).where(eq(promoMatches.promoId, promo.id)).all();
    const byClient = Object.fromEntries(matches.map((m) => [m.clientId, m.matchType]));
    expect(byClient[modelClientId]).toBe("model");
    expect(byClient[collClientId]).toBe("collection");
  });

  it("does not substring-false-positive Octa vs Octa 770", async () => {
    const clientId = randomUUID();
    clientIds.push(clientId);
    db.insert(clients).values({
      id: clientId, firstName: "SeriesGuy",
      productsOfInterest: [{ model: null, collection: "Octa 770", brand: null, intent: "interested" }],
    }).run();

    await createPromo(`SER-${Date.now()}`, "Octa", "Meridian");
    const promo = db.select().from(promoWatches).where(eq(promoWatches.collection, "Octa")).get()!;
    promoIds.push(promo.id);

    const match = db.select().from(promoMatches)
      .where(eq(promoMatches.promoId, promo.id)).all()
      .find((m) => m.clientId === clientId);
    expect(match).toBeUndefined(); // "Octa" must not match "Octa 770"
  });

  it("correctCatalog cascades the collection to client entries and curates the row", async () => {
    const clientId = randomUUID();
    clientIds.push(clientId);
    const model = `COR-${Date.now()}`;
    catalogModels.push(model);
    recordModelCollection(db, model, "OLDCOLL", "manual");
    db.insert(clients).values({
      id: clientId, firstName: "Cascade",
      productsOfInterest: [{ model, collection: "OLDCOLL", brand: null, intent: "promo" }],
    }).run();

    const res = await correctCatalog(model, "NEWCOLL");
    expect("affected" in res && res.affected).toBe(1);
    expect(getCatalogMap()[model]).toBe("NEWCOLL");
    const row = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(row.source).toBe("curated");
    const c = db.select().from(clients).where(eq(clients.id, clientId)).get()!;
    expect(c.productsOfInterest[0].collection).toBe("NEWCOLL");
  });

  it("flags (does not overwrite) a curated row on a disagreeing promo import, and resolveFlag works", async () => {
    const model = `FLG-${Date.now()}`;
    catalogModels.push(model);
    await correctCatalog(model, "CURATEDCOLL"); // creates curated row
    await createPromo(model, "PROMOCOLL", "Meridian");
    const promo = db.select().from(promoWatches).where(eq(promoWatches.modelNumber, model)).get();
    if (promo) promoIds.push(promo.id);

    let row = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(row.collection).toBe("CURATEDCOLL"); // not overwritten
    expect(row.flaggedCollection).toBe("PROMOCOLL");

    // Reject → keep curated, clear flag.
    await resolveFlag(model, false);
    row = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(row.collection).toBe("CURATEDCOLL");
    expect(row.flaggedCollection).toBeNull();
  });

  it("resolveFlag(accept) adopts the promo value", async () => {
    const model = `FLA-${Date.now()}`;
    catalogModels.push(model);
    await correctCatalog(model, "CURATEDCOLL");
    await createPromo(model, "PROMOCOLL", "Meridian");
    const promo = db.select().from(promoWatches).where(eq(promoWatches.modelNumber, model)).get();
    if (promo) promoIds.push(promo.id);

    await resolveFlag(model, true);
    const row = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(row.collection).toBe("PROMOCOLL");
    expect(row.flaggedCollection).toBeNull();
  });

  it("derive-at-read: promo matching uses the catalog collection, not the stored POI value", async () => {
    const ts = Date.now();
    const dModel = `DAR-${ts}`;
    const clientId = randomUUID();
    catalogModels.push(dModel);
    clientIds.push(clientId);

    // Catalog says this model is REALCOLL; the client's POI stored a
    // stale collection that derive-at-read must ignore.
    recordModelCollection(db, dModel, "REALCOLL", "promo");
    db.insert(clients).values({
      id: clientId, firstName: "DeriveAtRead",
      productsOfInterest: [{ model: dModel, collection: "STALECOLL", brand: null, intent: "promo" }],
    }).run();

    // A promo in the catalog-resolved collection (different model) must
    // collection-match the client.
    await createPromo(`PRM-${ts}`, "REALCOLL", "Meridian");
    const p1 = db.select().from(promoWatches).where(eq(promoWatches.modelNumber, `PRM-${ts}`)).get()!;
    promoIds.push(p1.id);
    // A promo in the stale (stored-but-not-catalog) collection must NOT.
    await createPromo(`PRS-${ts}`, "STALECOLL", "Ashford");
    const p2 = db.select().from(promoWatches).where(eq(promoWatches.modelNumber, `PRS-${ts}`)).get()!;
    promoIds.push(p2.id);

    const m1 = db.select().from(promoMatches)
      .where(eq(promoMatches.promoId, p1.id)).all().find((m) => m.clientId === clientId);
    const m2 = db.select().from(promoMatches)
      .where(eq(promoMatches.promoId, p2.id)).all().find((m) => m.clientId === clientId);
    expect(m1?.matchType).toBe("collection"); // matched via catalog REALCOLL
    expect(m2).toBeUndefined();                // stale STALECOLL ignored
  });

  it("rejects catalog correction from an associate (manager only)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession as never);
    await expect(correctCatalog("ANY-1", "X")).rejects.toThrow();
    vi.mocked(getServerSession).mockResolvedValue(managerSession as never);
  });

  it("BRAND_VALUES includes Kinetic and the create schema accepts it", () => {
    expect(BRAND_VALUES).toContain("Kinetic");
    const parsed = clientCreateSchema.safeParse({
      firstName: "Acc", lastName: "Test", preferredContact: "call",
      productsOfInterest: [{ model: null, collection: null, brand: "Kinetic", intent: "interested" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("getCatalogIndex returns collection + brand for a row", () => {
    const model = `IDX-${Date.now()}`;
    catalogModels.push(model);
    db.insert(modelCatalog).values({
      model, collection: "SENTINEL", source: "curated",
      brand: "Kinetic", msrp: 495, needsReview: true,
    }).run();
    const idx = getCatalogIndex();
    expect(idx.get(model)).toEqual({ collection: "SENTINEL", brand: "Kinetic" });
    const row = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(row.msrp).toBe(495);
    expect(row.needsReview).toBe(true);
  });
});
