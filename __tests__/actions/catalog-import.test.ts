import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { modelCatalog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { analyzeCatalogRvx, importCatalogRvx } from "@/lib/actions/catalog-import";

const MANAGER = { user: { id: "2d7a352d-53a0-4544-b515-902e7dd59206", name: "X", role: "manager" } };
const ASSOCIATE = { user: { id: "590628cf-d623-456d-bdad-d16ab0ec2b23", name: "H", role: "associate" } };

function fixture(style: string, cls: string, sub: string, price: string) {
  return `<Workbook xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet><Table>
<Row><Cell ss:Index="3"><Data>Class Code</Data></Cell><Cell><Data>Sub-Class Code</Data></Cell><Cell ss:Index="6"><Data>Vendor Style</Data></Cell><Cell ss:Index="33"><Data>Retail Price</Data></Cell></Row>
<Row><Cell ss:Index="3"><Data>${cls}</Data></Cell><Cell><Data>${sub}</Data></Cell><Cell ss:Index="6"><Data>${style}</Data></Cell><Cell ss:Index="33"><Data>${price}</Data></Cell></Row>
</Table></Worksheet></Workbook>`;
}

describe("catalog RVX import", () => {
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

    const a = await analyzeCatalogRvx(fixture(model, "ASH-ASHFORD", "SUT-BELGRAVE", "500"));
    if ("error" in a) throw new Error(a.error);
    expect(a.total).toBe(1);
    expect(a.updatedCount).toBe(1);
    expect(a.collectionChanges).toEqual([{ model, from: "OLDCOLL", to: "BELGRAVE" }]);
  });

  it("import upserts authoritatively (collection/brand/msrp, source=curated)", async () => {
    const model = `CIMP2-${Date.now()}`;
    models.push(model);
    const r = await importCatalogRvx(fixture(model, "ASH-ASHFORD", "SUT-BELGRAVE", "500"));
    if ("error" in r) throw new Error(r.error);
    expect(r.created).toBe(1);
    const row = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(row.collection).toBe("BELGRAVE");
    expect(row.brand).toBe("Ashford");
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

    const r = await importCatalogRvx(fixture(model, "VOS -VOSS", "APN-VOSS RIDGELINE", "1200"));
    if ("error" in r) throw new Error(r.error);
    expect(r.updated).toBe(1);
    const row = db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()!;
    expect(row.collection).toBe("VOSS RIDGELINE");
    expect(row.brand).toBe("Voss");
    expect(row.flaggedCollection).toBeNull();
  });

  it("rejects a non-manager", async () => {
    vi.mocked(getServerSession).mockResolvedValue(ASSOCIATE as never);
    await expect(analyzeCatalogRvx(fixture("X-1", "ASH-ASHFORD", "SUT-BELGRAVE", "1"))).rejects.toThrow();
    await expect(importCatalogRvx(fixture("X-1", "ASH-ASHFORD", "SUT-BELGRAVE", "1"))).rejects.toThrow();
  });
});
