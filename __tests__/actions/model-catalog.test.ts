import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { clients, promoWatches, promoMatches, modelCatalog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createPromo, clearAllPromos, correctCatalog, resolveFlag } from "@/lib/actions";
import { recordModelCollection, getCatalogMap } from "@/lib/actions/model-catalog";

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

  it("manual entry fills an unknown model, then never overwrites it", () => {
    const model = `CAT-${Date.now()}`;
    catalogModels.push(model);

    expect(recordModelCollection(db, model, "Solaris", "manual").conflict).toBeUndefined();
    expect(getCatalogMap()[model]).toBe("Solaris");

    // Conflicting manual entry: kept, reported, not overwritten — and now
    // also flagged for manager review on /catalog.
    const res = recordModelCollection(db, model, "Sentinel", "manual");
    expect(res.conflict).toEqual({ model, existing: "Solaris", attempted: "Sentinel" });
    expect(getCatalogMap()[model]).toBe("Solaris");
    const flaggedRow = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(flaggedRow.flaggedCollection).toBe("Sentinel");
    expect(flaggedRow.flaggedSource).toBe("manual");
  });

  it("a manual conflict never stomps an already-pending promo flag", async () => {
    const model = `MFP-${Date.now()}`;
    catalogModels.push(model);
    await correctCatalog(model, "CURATEDCOLL"); // curated row
    await createPromo(model, "PROMOCOLL", "Meridian"); // promo disagrees → promo flag
    const promo = db.select().from(promoWatches).where(eq(promoWatches.modelNumber, model)).get();
    if (promo) promoIds.push(promo.id);

    // A disagreeing manual entry arrives while the promo flag is pending.
    const res = recordModelCollection(db, model, "MANUALCOLL", "manual");
    expect(res.conflict).toEqual({ model, existing: "CURATEDCOLL", attempted: "MANUALCOLL" });
    const row = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(row.flaggedCollection).toBe("PROMOCOLL"); // promo flag preserved
    expect(row.flaggedSource).toBe("promo");
  });

  it("resolveFlag(accept) on a manual flag blesses the value as curated", async () => {
    const model = `MFA-${Date.now()}`;
    catalogModels.push(model);
    recordModelCollection(db, model, "FIRSTCOLL", "manual"); // seeds the row
    recordModelCollection(db, model, "BETTERCOLL", "manual"); // disagree → manual flag
    let row = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(row.flaggedSource).toBe("manual");

    await resolveFlag(model, true);
    row = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(row.collection).toBe("BETTERCOLL");
    expect(row.source).toBe("curated"); // manager blessing, not "promo"
    expect(row.flaggedCollection).toBeNull();
  });

  it("promo source is authoritative and overwrites", () => {
    const model = `CAT-${Date.now()}-P`;
    catalogModels.push(model);
    recordModelCollection(db, model, "Solaris", "manual");
    recordModelCollection(db, model, "Sentinel", "promo");
    expect(getCatalogMap()[model]).toBe("Sentinel");
  });

  it("ignores entries missing model or collection", () => {
    expect(recordModelCollection(db, null, "Solaris", "manual").conflict).toBeUndefined();
    expect(recordModelCollection(db, "ABC-1", null, "manual").conflict).toBeUndefined();
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

  it("rejects catalog correction from an associate (manager only)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession as never);
    await expect(correctCatalog("ANY-1", "X")).rejects.toThrow();
    vi.mocked(getServerSession).mockResolvedValue(managerSession as never);
  });
});
