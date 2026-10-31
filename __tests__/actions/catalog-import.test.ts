import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { modelCatalog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { analyzeCatalogImport, importCatalog } from "@/lib/actions/catalog-import";

const MANAGER: Session = {
  user: { id: "2d7a352d-53a0-4544-b515-902e7dd59206", name: "X", role: "manager", firstName: "X", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};
const ASSOCIATE: Session = {
  user: { id: "590628cf-d623-456d-bdad-d16ab0ec2b23", name: "H", role: "associate", firstName: "H", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

// Catalog files are positional: A brand, B collection, C model, D MSRP.
function fixture(model: string, brand: string, collection: string, price: string) {
  return `Brand,Collection,Model,MSRP\n${brand},${collection},${model},${price}\n`;
}

describe("catalog import", () => {
  const models: string[] = [];
  beforeEach(() => vi.mocked(getServerSession).mockResolvedValue(MANAGER as never));
  afterEach(() => {
    for (const m of models) { try { db.delete(modelCatalog).where(eq(modelCatalog.model, m)).run(); } catch { /* */ } }
    models.length = 0;
  });

  it("analyze reports new / updated / unchanged + collection changes", async () => {
    const model = `CIMP-${Date.now()}`;
    models.push(model);
    db.insert(modelCatalog).values({ model, collection: "OLDCOLL", source: "manual" }).run();

    const a = await analyzeCatalogImport(fixture(model, "Aldermoor", "BELGRAVE", "500"));
    if ("error" in a) throw new Error(a.error);
    expect(a.total).toBe(1);
    expect(a.updatedCount).toBe(1);
    expect(a.collectionChanges).toEqual([{ model, from: "OLDCOLL", to: "BELGRAVE" }]);
  });

  it("analyze flags a narrow catalog export (curated models missing from file)", async () => {
    // Seed 4 curated models. The new file covers only 1 of them →
    // 3 missing, well over the 30% threshold the dialog warns on.
    const stamp = Date.now();
    const keep = `NRW-K-${stamp}`;
    const drop = [`NRW-D1-${stamp}`, `NRW-D2-${stamp}`, `NRW-D3-${stamp}`];
    for (const m of [keep, ...drop]) {
      models.push(m);
      db.insert(modelCatalog).values({ model: m, collection: "X", source: "curated", brand: "Aldermoor", msrp: 100 }).run();
    }
    const a = await analyzeCatalogImport(fixture(keep, "Aldermoor", "BELGRAVE", "500"));
    if ("error" in a) throw new Error(a.error);
    expect(a.prevCuratedCount).toBeGreaterThanOrEqual(4);
    expect(a.prevCuratedMissingFromFile).toBeGreaterThanOrEqual(3);
    // Heuristic check the dialog uses
    expect(a.prevCuratedMissingFromFile).toBeGreaterThan(a.prevCuratedCount * 0.3);
  });

  it("import upserts authoritatively (collection/brand/msrp, source=curated)", async () => {
    const model = `CIMP2-${Date.now()}`;
    models.push(model);
    const r = await importCatalog(fixture(model, "Aldermoor", "BELGRAVE", "500"));
    if ("error" in r) throw new Error(r.error);
    expect(r.created).toBe(1);
    const row = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(row.collection).toBe("BELGRAVE");
    expect(row.brand).toBe("Aldermoor");
    expect(row.msrp).toBe(500);
    expect(row.source).toBe("curated");
    expect(row.needsReview).toBe(false);
    expect(row.msrpSeenAt).not.toBeNull();
  });

  it("re-import overwrites and clears any pending flag", async () => {
    const model = `CIMP3-${Date.now()}`;
    models.push(model);
    db.insert(modelCatalog).values({
      model, collection: "CURATEDCOLL", source: "curated",
      flaggedCollection: "PROMOX", flaggedSource: "promo", flaggedAt: new Date(),
    }).run();

    const r = await importCatalog(fixture(model, "Vellamy", "VELLAMY RIPTIDE", "1200"));
    if ("error" in r) throw new Error(r.error);
    expect(r.updated).toBe(1);
    const row = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(row.collection).toBe("VELLAMY RIPTIDE");
    expect(row.brand).toBe("Vellamy");
    expect(row.flaggedCollection).toBeNull();
  });

  // Regression: a row with blank brand and MSRP cells parses them as null,
  // and the import wrote those nulls over the catalog — and counted every re-imported row as "updated".
  it("keeps existing msrp/brand when the file has none, and counts no update", async () => {
    const model = `CIMP4-${Date.now()}`;
    models.push(model);
    const seenAt = new Date("2026-01-15T00:00:00Z");
    db.insert(modelCatalog).values({
      model, collection: "BELGRAVE", source: "curated", brand: "Aldermoor", msrp: 500, msrpSeenAt: seenAt,
    }).run();
    const noPrice = `,BELGRAVE,${model},\n`;

    const a = await analyzeCatalogImport(noPrice);
    if ("error" in a) throw new Error(a.error);
    expect(a.unchangedCount).toBe(1);
    expect(a.updatedCount).toBe(0);

    const r = await importCatalog(noPrice);
    if ("error" in r) throw new Error(r.error);
    expect(r.updated).toBe(0);
    const row = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(row.msrp).toBe(500);
    expect(row.msrpSeenAt).toEqual(seenAt);
    expect(row.brand).toBe("Aldermoor");
  });

  it("does not count a data-identical re-import as updated", async () => {
    const model = `CIMP5-${Date.now()}`;
    models.push(model);
    const xml = fixture(model, "Aldermoor", "BELGRAVE", "500");
    const first = await importCatalog(xml);
    if ("error" in first) throw new Error(first.error);
    expect(first.created).toBe(1);

    const again = await importCatalog(xml);
    if ("error" in again) throw new Error(again.error);
    expect(again).toMatchObject({ created: 0, updated: 0 });
  });

  it("still promotes a data-identical non-curated row to curated", async () => {
    const model = `CIMP6-${Date.now()}`;
    models.push(model);
    db.insert(modelCatalog).values({ model, collection: "BELGRAVE", source: "promo", brand: "Aldermoor", msrp: 500, needsReview: true }).run();

    const r = await importCatalog(fixture(model, "Aldermoor", "BELGRAVE", "500"));
    if ("error" in r) throw new Error(r.error);
    expect(r.updated).toBe(0);
    const row = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(row.source).toBe("curated");
    expect(row.needsReview).toBe(false);
  });

  it("rejects a non-manager", async () => {
    vi.mocked(getServerSession).mockResolvedValue(ASSOCIATE as never);
    await expect(analyzeCatalogImport(fixture("X-1", "Aldermoor", "BELGRAVE", "1"))).rejects.toThrow();
    await expect(importCatalog(fixture("X-1", "Aldermoor", "BELGRAVE", "1"))).rejects.toThrow();
  });
});
