import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { clients, promoWatches, promoMatches, modelCatalog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createPromo, clearAllPromos } from "@/lib/actions";
import { recordModelCollection, getCatalogMap } from "@/lib/actions/model-catalog";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const managerSession = { user: { id: MANAGER_ID, name: "Marcus", role: "manager" } };

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

    // Conflicting manual entry: kept, reported, not overwritten.
    const res = recordModelCollection(db, model, "Sentinel", "manual");
    expect(res.conflict).toEqual({ model, existing: "Solaris", attempted: "Sentinel" });
    expect(getCatalogMap()[model]).toBe("Solaris");
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
    await createPromo(model, collection);
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
      productsOfInterest: [{ model, collection: null }],
    }).run();
    db.insert(clients).values({
      id: collClientId, firstName: "CollMatch",
      productsOfInterest: [{ model: null, collection }],
    }).run();

    await createPromo(model, collection);
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
      productsOfInterest: [{ model: null, collection: "Octa 770" }],
    }).run();

    await createPromo(`SER-${Date.now()}`, "Octa");
    const promo = db.select().from(promoWatches).where(eq(promoWatches.collection, "Octa")).get()!;
    promoIds.push(promo.id);

    const match = db.select().from(promoMatches)
      .where(eq(promoMatches.promoId, promo.id)).all()
      .find((m) => m.clientId === clientId);
    expect(match).toBeUndefined(); // "Octa" must not match "Octa 770"
  });
});
