import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { brands, clients, modelCatalog, promoItems } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createBrand, renameBrand, deleteBrand, listBrands, createPromo } from "@/lib/actions";
import { getBrandNames } from "@/lib/brands";

const managerSession: Session = {
  user: { id: "2d7a352d-53a0-4544-b515-902e7dd59206", name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};
const associateSession: Session = {
  user: { id: "590628cf-d623-456d-bdad-d16ab0ec2b23", name: "Jordan", role: "associate", firstName: "Jordan", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

const tag = randomUUID().slice(0, 6).toUpperCase();
const name = (s: string) => `Zz${s}${tag}`;
const idOf = (n: string) => db.select({ id: brands.id }).from(brands).where(eq(brands.name, n)).get()?.id;

describe("brand actions", () => {
  const made: string[] = [];
  const models: string[] = [];
  const clientIds: string[] = [];
  const promoIds: string[] = [];

  beforeEach(() => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as never);
  });
  afterEach(() => {
    if (promoIds.length) db.delete(promoItems).where(inArray(promoItems.id, promoIds)).run();
    if (clientIds.length) db.delete(clients).where(inArray(clients.id, clientIds)).run();
    if (models.length) db.delete(modelCatalog).where(inArray(modelCatalog.model, models)).run();
    db.delete(brands).where(inArray(brands.name, made.flatMap((n) => [n, n + "X", n.toUpperCase()]))).run();
  });

  it("adds a brand and refuses duplicates in any capitalisation", async () => {
    const n = name("Add"); made.push(n);
    expect(await createBrand(`  ${n}  `)).toBeUndefined();
    expect(getBrandNames()).toContain(n);
    expect(await createBrand(n.toUpperCase())).toEqual({ error: "A brand with this name already exists" });
    expect(await createBrand("   ")).toEqual({ error: "Brand name is required" });
  });

  it("is managers only", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession as never);
    await expect(createBrand(name("Nope"))).rejects.toThrow();
  });

  it("renames a brand on catalog models, promos and clients' interests", async () => {
    const n = name("Ren"); made.push(n);
    await createBrand(n);
    const model = `BR-${tag}`; models.push(model);
    db.insert(modelCatalog).values({ model, collection: "TESTCOLL", source: "curated", brand: n }).run();
    const promoId = randomUUID(); promoIds.push(promoId);
    db.insert(promoItems).values({ id: promoId, modelNumber: model, collection: "TESTCOLL", brand: n }).run();
    const clientId = randomUUID(); clientIds.push(clientId);
    db.insert(clients).values({
      id: clientId, firstName: "Brand", lastName: "Test",
      productsOfInterest: [{ model, collection: "TESTCOLL", brand: n, intent: "interested" }, { model: null, collection: "OTHER", brand: null, intent: "promo" }],
    }).run();

    const before = (await listBrands()).find((b) => b.name === n);
    expect(before).toMatchObject({ catalogCount: 1, promoCount: 1, clientCount: 1 });

    expect(await renameBrand(idOf(n)!, n + "X")).toBeUndefined();
    expect(db.select().from(modelCatalog).where(eq(modelCatalog.model, model)).get()?.brand).toBe(n + "X");
    expect(db.select().from(promoItems).where(eq(promoItems.id, promoId)).get()?.brand).toBe(n + "X");
    expect(db.select().from(clients).where(eq(clients.id, clientId)).get()?.productsOfInterest).toEqual([
      { model, collection: "TESTCOLL", brand: n + "X", intent: "interested" },
      { model: null, collection: "OTHER", brand: null, intent: "promo" },
    ]);
  });

  it("lets a brand change only its own capitals, but not take another brand's name", async () => {
    const a = name("Capa"); const b = name("Capb"); made.push(a, b);
    await createBrand(a); await createBrand(b);
    expect(await renameBrand(idOf(a)!, a.toUpperCase())).toBeUndefined();
    expect(await renameBrand(idOf(b)!, a)).toEqual({ error: "A brand with this name already exists" });
  });

  it("refuses to remove a brand still in use, and says where", async () => {
    const n = name("Del"); made.push(n);
    await createBrand(n);
    const model = `BD-${tag}`; models.push(model);
    db.insert(modelCatalog).values({ model, collection: "TESTCOLL", source: "curated", brand: n }).run();
    expect(await deleteBrand(idOf(n)!)).toEqual({
      error: `${n} is still used by 1 catalog model. Change those first, or rename the brand instead.`,
    });
    db.delete(modelCatalog).where(eq(modelCatalog.model, model)).run();
    expect(await deleteBrand(idOf(n)!)).toBeUndefined();
    expect(getBrandNames()).not.toContain(n);
  });

  it("only accepts listed brands on a new promo, fixing their capitals", async () => {
    const n = name("Promo"); made.push(n);
    await createBrand(n);
    expect(await createPromo(`BP-${tag}`, "TESTCOLL", "NotABrand", null, null, null, { promoStart: null, promoEnd: null })).toEqual({
      error: "\"NotABrand\" isn't in the brand list (Settings → Brands)",
    });
    expect(await createPromo(`BP-${tag}`, "TESTCOLL", n.toLowerCase(), null, null, null, { promoStart: null, promoEnd: null })).toBeUndefined();
    const row = db.select().from(promoItems).where(eq(promoItems.modelNumber, `BP-${tag}`)).get();
    promoIds.push(row!.id);
    models.push(`BP-${tag}`);
    expect(row?.brand).toBe(n);
  });
});
