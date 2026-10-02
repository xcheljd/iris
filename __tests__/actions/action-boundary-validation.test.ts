import { vi, describe, it, expect, beforeEach, afterAll } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import {
  banClient,
  createPromo,
  importPromos,
  createSmartList,
  renameSmartList,
  addTag,
  patchClientFromFormMerge,
} from "@/lib/actions";
import { bulkBanClients } from "@/lib/actions/bulk-clients";
import { db } from "@/lib/db";
import { clients, activityEvents, bannedCustomers, promoWatches, promoMatches, modelCatalog, smartLists, clientTags } from "@/lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { randomUUID } from "crypto";
import { clientCreateSchema, clientPatchSchema, validateClientForm } from "@/lib/validation/client";

// Regression (m6): these action boundaries took unvalidated input — any ban
// category/reason, NaN/out-of-range promo numerics, unchecked promo dates,
// empty/unbounded smart-list names and arbitrary filter blobs, untrimmed tags —
// and the client form's email regex passed addresses the server 400s.

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

const P = `M6B${Date.now()}`;
const clientIds: string[] = [];

function createClient(overrides: Partial<typeof clients.$inferInsert> = {}) {
  const id = randomUUID();
  db.insert(clients).values({
    id, firstName: "Boundary", lastName: "Check", employeeId: MANAGER_ID, source: "Walk-in",
    productsOfInterest: [], tags: [], onEmailList: false, status: "active", ...overrides,
  }).run();
  clientIds.push(id);
  return id;
}

beforeEach(() => {
  vi.mocked(getServerSession).mockResolvedValue(managerSession);
});

afterAll(() => {
  db.delete(activityEvents).where(inArray(activityEvents.clientId, clientIds)).run();
  db.delete(bannedCustomers).where(inArray(bannedCustomers.customerId, clientIds)).run();
  db.delete(clients).where(inArray(clients.id, clientIds)).run();
  const promoIds = db.select({ id: promoWatches.id }).from(promoWatches).where(like(promoWatches.modelNumber, `${P}%`)).all().map((r) => r.id);
  if (promoIds.length) {
    db.delete(promoMatches).where(inArray(promoMatches.promoId, promoIds)).run();
    db.delete(promoWatches).where(inArray(promoWatches.id, promoIds)).run();
  }
  db.delete(modelCatalog).where(like(modelCatalog.model, `${P}%`)).run();
  db.delete(smartLists).where(like(smartLists.name, `${P}%`)).run();
  db.delete(clientTags).where(like(clientTags.name, `${P}%`)).run();
});

describe("ban category and reason", () => {
  it("rejects an unknown category or an over-long reason without banning", async () => {
    const id = createClient();
    expect(await banClient(id, "Shoplifting" as never, "x")).toEqual({ error: "Ban category is required" });
    expect(await banClient(id, "Other", "x".repeat(5001))).toHaveProperty("error");
    expect(db.select().from(clients).where(eq(clients.id, id)).get()!.status).toBe("active");

    const bulk = await bulkBanClients([id], "Shoplifting" as never, "x");
    expect(bulk.ok).toBe(0);
    expect(bulk.error).toBeDefined();
    expect(db.select().from(clients).where(eq(clients.id, id)).get()!.status).toBe("active");
  });

  it("bans with a valid category and stores the trimmed reason", async () => {
    const one = createClient();
    const two = createClient();
    expect(await banClient(one, "Reselling", "  flipping stock  ")).toBeUndefined();
    expect(db.select().from(bannedCustomers).where(eq(bannedCustomers.customerId, one)).get()!.specificBanReason).toBe("flipping stock");

    expect((await bulkBanClients([two], "Other", " bulk ")).ok).toBe(1);
    expect(db.select().from(bannedCustomers).where(eq(bannedCustomers.customerId, two)).get()!.specificBanReason).toBe("bulk");
  });
});

describe("createPromo", () => {
  it("rejects NaN, negative and out-of-range numerics", async () => {
    expect(await createPromo(`${P}-A`, "Col", "Meridian", Number.NaN)).toHaveProperty("error");
    expect(await createPromo(`${P}-A`, "Col", "Meridian", null, 150)).toHaveProperty("error");
    expect(await createPromo(`${P}-A`, "Col", "Meridian", null, -1)).toHaveProperty("error");
    expect(await createPromo(`${P}-A`, "Col", "Meridian", null, null, null, -2)).toHaveProperty("error");
    expect(await createPromo(`${P}-A`, "Col", "Meridian", null, null, null, 0, Number.NaN)).toHaveProperty("error");
    expect(db.select().from(promoWatches).where(like(promoWatches.modelNumber, `${P}%`)).all()).toHaveLength(0);
  });

  it("normalizes the model number like importPromos does", async () => {
    expect(await createPromo(`  ${P.toLowerCase()}-b `, "Col", "Meridian", 100, 20, null, 1, 0)).toBeUndefined();
    const row = db.select().from(promoWatches).where(eq(promoWatches.modelNumber, `${P}-B`)).get();
    expect(row).toBeDefined();
    expect(row!.discountPercent).toBe(20);
  });
});

describe("importPromos promo period", () => {
  const rows = [{ modelNumber: `${P}-IMP`, collection: "Col", brand: "Meridian" as const }];

  it("rejects malformed dates and a start after the end", async () => {
    expect(await importPromos(rows, "2026-02-31", null)).toHaveProperty("error");
    expect(await importPromos(rows, "10/01/2026", null)).toHaveProperty("error");
    expect(await importPromos(rows, "2026-10-05", "2026-10-01")).toEqual({ error: "Promo start must be on or before promo end" });
    expect(db.select().from(promoWatches).where(eq(promoWatches.modelNumber, `${P}-IMP`)).all()).toHaveLength(0);
  });

  it("accepts a valid period (or none)", async () => {
    expect(await importPromos(rows, "2026-10-01", "2026-10-01")).toMatchObject({ imported: 1 });
    expect(await importPromos(rows)).toMatchObject({ imported: 1 });
  });
});

describe("smart list names and filters", () => {
  it("rejects empty, whitespace-only and over-long names", async () => {
    expect(await createSmartList("", {})).toEqual({ error: "List name is required" });
    expect(await createSmartList("   ", {})).toEqual({ error: "List name is required" });
    expect(await createSmartList(`${P}${"x".repeat(101)}`, {})).toHaveProperty("error");
  });

  it("rejects unknown filter keys and wrong value types", async () => {
    expect(await createSmartList(`${P} bad`, { dropTable: true })).toHaveProperty("error");
    expect(await createSmartList(`${P} bad`, { tags: "VIP" })).toHaveProperty("error");
    expect(db.select().from(smartLists).where(eq(smartLists.name, `${P} bad`)).all()).toHaveLength(0);
  });

  it("creates with known filters and trims the name; rename validates the same way", async () => {
    const created = await createSmartList(`  ${P} ok  `, { heat: "hot", tags: ["VIP"], tagMode: "all", onEmailList: true });
    expect(created).toHaveProperty("id");
    const id = (created as { id: string }).id;
    expect(db.select().from(smartLists).where(eq(smartLists.id, id)).get()!.name).toBe(`${P} ok`);

    expect(await renameSmartList(id, "   ")).toEqual({ error: "List name is required" });
    expect(await renameSmartList(id, "x".repeat(101))).toHaveProperty("error");
    expect(await renameSmartList(id, ` ${P} renamed `)).toBeUndefined();
    expect(db.select().from(smartLists).where(eq(smartLists.id, id)).get()!.name).toBe(`${P} renamed`);
  });
});

describe("addTag", () => {
  it("rejects an empty tag after trimming", async () => {
    const id = createClient();
    expect(await addTag(id, "   ")).toEqual({ error: "Tag name is required" });
    expect(db.select().from(clients).where(eq(clients.id, id)).get()!.tags).toEqual([]);
  });

  it("trims the tag like createTag does", async () => {
    const id = createClient();
    expect(await addTag(id, `  ${P}-tag  `)).toBeUndefined();
    expect(db.select().from(clients).where(eq(clients.id, id)).get()!.tags).toEqual([`${P}-tag`]);
    expect(db.select().from(clientTags).where(eq(clientTags.name, `${P}-tag`)).get()).toBeDefined();
  });
});

describe("client form vs server email/name parity", () => {
  const base = { firstName: "Ana", lastName: "Reyes", preferredContact: "email" };

  it.each(["a@b.c.", "a@b..c", "a@b"])("form and server both reject %s", (email) => {
    expect(validateClientForm({ ...base, email })).toBe("Invalid email format");
    expect(clientCreateSchema.safeParse({ ...base, email }).success).toBe(false);
  });

  it("form and server both accept a padded valid email, and the server stores it trimmed", () => {
    expect(validateClientForm({ ...base, email: " ana@example.com " })).toBeNull();
    const parsed = clientCreateSchema.parse({ ...base, email: " ana@example.com " });
    expect(parsed.email).toBe("ana@example.com");
  });

  it("server trims names and rejects a whitespace-only first name", () => {
    expect(clientCreateSchema.safeParse({ ...base, firstName: "   " }).success).toBe(false);
    expect(clientPatchSchema.safeParse({ firstName: "   " }).success).toBe(false);
    expect(clientCreateSchema.parse({ ...base, firstName: " Ana ", lastName: " Reyes " })).toMatchObject({ firstName: "Ana", lastName: "Reyes" });
    expect(clientPatchSchema.parse({ firstName: " Ana ", lastName: "   " })).toEqual({ firstName: "Ana", lastName: null });
  });

  it("a form merge that omits lastName keeps the existing one", async () => {
    const id = createClient({ lastName: "Keep" });
    expect(await patchClientFromFormMerge(id, { firstName: "Boundary" })).toBeUndefined();
    expect(db.select().from(clients).where(eq(clients.id, id)).get()!.lastName).toBe("Keep");
  });
});
