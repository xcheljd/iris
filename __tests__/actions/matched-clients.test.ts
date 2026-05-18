import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { clients, promoWatches, promoMatches } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createPromo } from "@/lib/actions";
import { getMatchedClients } from "@/lib/queries";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";
const mgr = { user: { id: MANAGER_ID, name: "Marcus", role: "manager" } };

describe("getMatchedClients", () => {
  const clientIds: string[] = [];
  const promoIds: string[] = [];

  beforeEach(() => vi.mocked(getServerSession).mockResolvedValue(mgr as never));
  afterEach(() => {
    for (const id of promoIds) {
      try {
        db.delete(promoMatches).where(eq(promoMatches.promoId, id)).run();
        db.delete(promoWatches).where(eq(promoWatches.id, id)).run();
      } catch { /* */ }
    }
    for (const id of clientIds) {
      try { db.delete(clients).where(eq(clients.id, id)).run(); } catch { /* */ }
    }
    clientIds.length = promoIds.length = 0;
  });

  it("returns one row per (client, promo); includes brand matches; excludes deleted; scopes by employee", async () => {
    const ts = Date.now();
    const model = `MMC-${ts}`;
    const collection = `MMCCOL-${ts}`;
    const ownClientId = randomUUID();
    const otherClientId = randomUUID();
    const brandClientId = randomUUID();
    clientIds.push(ownClientId, otherClientId, brandClientId);

    // Owned by the associate, model interest → model match.
    db.insert(clients).values({
      id: ownClientId, firstName: "Owned", lastName: "Assoc", employeeId: ASSOCIATE_ID,
      productsOfInterest: [{ model, collection: null, brand: null, intent: "promo" }],
    }).run();
    // Owned by the manager, same model → model match (manager-scope only).
    db.insert(clients).values({
      id: otherClientId, firstName: "Other", lastName: "Mgr", employeeId: MANAGER_ID,
      productsOfInterest: [{ model, collection: null, brand: null, intent: "promo" }],
    }).run();
    // Brand-only interest in Meridian → brand match.
    db.insert(clients).values({
      id: brandClientId, firstName: "BrandOnly", lastName: "Cit", employeeId: ASSOCIATE_ID,
      productsOfInterest: [{ model: null, collection: null, brand: "Meridian", intent: "promo" }],
    }).run();

    await createPromo(model, collection, "Meridian");
    const promo = db.select().from(promoWatches).where(eq(promoWatches.modelNumber, model)).get()!;
    promoIds.push(promo.id);

    // Manager view: all three matched (2 model + 1 brand), one row each.
    const all = await getMatchedClients();
    const mine = all.filter((r) => r.clientId === ownClientId);
    expect(mine).toHaveLength(1);
    expect(mine[0].matchType).toBe("model");
    expect(mine[0].promoBrand).toBe("Meridian");
    const brandRow = all.find((r) => r.clientId === brandClientId);
    expect(brandRow?.matchType).toBe("brand");
    expect(all.some((r) => r.clientId === otherClientId)).toBe(true);

    // Associate-scoped: only their own clients.
    const scoped = await getMatchedClients(ASSOCIATE_ID);
    expect(scoped.some((r) => r.clientId === ownClientId)).toBe(true);
    expect(scoped.some((r) => r.clientId === brandClientId)).toBe(true);
    expect(scoped.some((r) => r.clientId === otherClientId)).toBe(false);

    // Soft-deleted client excluded.
    db.update(clients).set({ deletedAt: new Date(), status: "deleted" }).where(eq(clients.id, ownClientId)).run();
    const afterDelete = await getMatchedClients();
    expect(afterDelete.some((r) => r.clientId === ownClientId)).toBe(false);
  });
});
