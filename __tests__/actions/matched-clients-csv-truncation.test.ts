import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// A cap of 3 lets a handful of fixture rows stand in for a >10k-row book.
vi.mock("@/lib/constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/constants")>()),
  LIST_QUERY_LIMIT: 3,
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { clients, employees, promoWatches, promoMatches } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createPromo, exportMatchedClientsCsv } from "@/lib/actions";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const mgr: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

// Regression (m3): facets were applied in JS after the LIMIT, so a filtered
// export over a large book could silently miss rows, and `truncated` was
// computed on a set that could never exceed the cap.
describe("exportMatchedClientsCsv truncation", () => {
  const clientIds: string[] = [];
  const promoIds: string[] = [];
  const employeeIds: string[] = [];

  beforeEach(() => vi.mocked(getServerSession).mockResolvedValue(mgr as never));
  afterEach(() => {
    for (const id of promoIds) {
      db.delete(promoMatches).where(eq(promoMatches.promoId, id)).run();
      db.delete(promoWatches).where(eq(promoWatches.id, id)).run();
    }
    for (const id of clientIds) db.delete(clients).where(eq(clients.id, id)).run();
    for (const id of employeeIds) db.delete(employees).where(eq(employees.id, id)).run();
    clientIds.length = promoIds.length = employeeIds.length = 0;
  });

  it("filters by facet before the cap and reports truncation", async () => {
    const ts = Date.now();
    const model = `MXT-${ts}`;
    const owner = randomUUID();
    const ownerFirst = `Trunc${ts}`;
    employeeIds.push(owner);
    db.insert(employees).values({
      id: owner, name: ownerFirst, firstName: ownerFirst, lastName: "Owner",
      username: `trunc-${ts}`, passwordHash: "x", role: "associate",
    }).run();

    const collection = `MXTCOL-${ts}`;
    const addClient = (lastName: string, employeeId: string, byCollection = false) => {
      const id = randomUUID();
      clientIds.push(id);
      db.insert(clients).values({
        id, firstName: "T", lastName, employeeId,
        productsOfInterest: [byCollection
          ? { model: null, collection, brand: null, intent: "promo" }
          : { model, collection: null, brand: null, intent: "promo" }],
      }).run();
    };
    // Other-owner rows sort first, so a post-cap filter would drop ours.
    for (let i = 0; i < 4; i++) addClient(`Aaa${i}`, MANAGER_ID);
    addClient("Zzz0", owner);
    addClient("Zzz1", owner);
    addClient("Zzz2", owner, true);
    addClient("Zzz3", owner, true);

    await createPromo(model, collection, "Meridian");
    promoIds.push(db.select().from(promoWatches).where(eq(promoWatches.modelNumber, model)).get()!.id);

    const ownerName = `${ownerFirst} Owner`;
    const ownerRowsOnly = (csv: string) => {
      for (const line of csv.split("\n").slice(1)) expect(line).toContain(`,${ownerName},`);
    };

    // 2 filtered rows, under the cap of 3.
    const under = await exportMatchedClientsCsv({ mode: "filter", owners: [ownerName], matchTypes: ["collection"], brands: [] });
    expect(under.rowCount).toBe(2);
    expect(under.truncated).toBe(false);
    ownerRowsOnly(under.csv);

    // 4 filtered rows, over the cap of 3.
    const over = await exportMatchedClientsCsv({ mode: "filter", owners: [ownerName], matchTypes: [], brands: [] });
    expect(over.truncated).toBe(true);
    expect(over.rowCount).toBe(3);
    ownerRowsOnly(over.csv);
  });
});
