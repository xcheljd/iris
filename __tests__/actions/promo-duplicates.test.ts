import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { promoItems, promoMatches, modelCatalog } from "@/lib/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import { randomUUID } from "crypto";
import { importPromos, resolvePromoRows } from "@/lib/actions";

const managerSession: Session = {
  user: { id: "2d7a352d-53a0-4544-b515-902e7dd59206", name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};
const T = randomUUID().slice(0, 6).toUpperCase();
const M = `PDU${T}-1`;
const promos = () => db.select().from(promoItems).where(eq(promoItems.modelNumber, M)).all();

describe("promo import duplicates against Iris", () => {
  beforeEach(() => vi.mocked(getServerSession).mockResolvedValue(managerSession as never));
  afterEach(() => {
    const ids = promos().map((p) => p.id);
    if (ids.length) {
      db.delete(promoMatches).where(inArray(promoMatches.promoId, ids)).run();
      db.delete(promoItems).where(inArray(promoItems.id, ids)).run();
    }
    db.delete(modelCatalog).where(like(modelCatalog.model, `PDU${T}-%`)).run();
  });

  it("returns existing promos per model, and gives each row its own key", async () => {
    await importPromos([{ modelNumber: M, collection: "C", discountPercent: 20 }], "2026-05-01", "2026-05-07");
    const res = await resolvePromoRows([
      { modelNumber: M, collection: "C", sourceRow: 2, sourceSheet: "20%" },
      { modelNumber: M, collection: "C", sourceRow: 3, sourceSheet: "30%" },
    ]);
    if ("error" in res) throw new Error(res.error);
    expect(res.resolved.map((r) => r.rowKey)).toEqual(["20%#2", "30%#3"]);
    expect(res.existing[M]).toMatchObject([{ modelNumber: M, discountPercent: 20, promoStart: "2026-05-01", promoEnd: "2026-05-07" }]);
  });

  it("blocks a row that clashes with a promo for the same dates unless it replaces it", async () => {
    await importPromos([{ modelNumber: M, collection: "C", discountPercent: 20 }], "2026-05-01", "2026-05-07");
    const [old] = promos();
    expect(await importPromos([{ modelNumber: M, collection: "C", discountPercent: 30 }], "2026-05-01", "2026-05-07"))
      .toEqual({ error: `${M} already has a promo for these dates — choose keep or replace before importing` });
    // Different dates aren't a duplicate.
    expect(await importPromos([{ modelNumber: M, collection: "C", discountPercent: 25 }], "2026-06-01", "2026-06-07")).toMatchObject({ imported: 1 });
    const res = await importPromos([{ modelNumber: M, collection: "C", discountPercent: 30 }], "2026-05-01", "2026-05-07", { replacePromoIds: [old.id] });
    expect(res).toMatchObject({ imported: 1, replaced: 1 });
    expect(promos().map((p) => [p.promoStart, p.discountPercent]).sort()).toEqual([["2026-05-01", 30], ["2026-06-01", 25]]);
  });
});
