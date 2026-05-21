import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { clients, promoWatches, promoMatches } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createPromo, exportMatchedClientsCsv } from "@/lib/actions";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";
const mgr = { user: { id: MANAGER_ID, name: "Marcus", role: "manager" } };
const assoc = { user: { id: ASSOCIATE_ID, name: "Jordan", role: "associate" } };

const HEADER = "Client ID,First Name,Last Name,Assigned Associate,Preferred Contact,Phone,Email,Promo Model,Promo Collection,Promo Brand,MSRP,Sale Price,Match Type";

describe("exportMatchedClientsCsv", () => {
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

  it("emits the 13-column header and a row per (client, promo); scope + RBAC", async () => {
    const ts = Date.now();
    const model = `MX-${ts}`;
    const collection = `MXCOL-${ts}`;
    const own = randomUUID();
    const other = randomUUID();
    clientIds.push(own, other);

    // Associate's client with a model interest → model match.
    db.insert(clients).values({
      id: own, firstName: "Owned", lastName: "A", employeeId: ASSOCIATE_ID,
      phone: "555-1", email: "o@x.com", preferredContact: "text",
      productsOfInterest: [{ model, collection: null, brand: null, intent: "promo" }],
    }).run();
    // Manager's client with a collection interest → collection match.
    // (Brand-only interest used to brand-match; commit ffee6fc dropped
    // brand-level matches, so we exercise the scope/filter logic with a
    // collection match instead.)
    db.insert(clients).values({
      id: other, firstName: "Mgr", lastName: "B", employeeId: MANAGER_ID,
      productsOfInterest: [{ model: null, collection, brand: null, intent: "promo" }],
    }).run();

    await createPromo(model, collection, "Meridian");
    const promo = db.select().from(promoWatches).where(eq(promoWatches.modelNumber, model)).get()!;
    promoIds.push(promo.id);

    // Manager, all scope.
    const all = await exportMatchedClientsCsv({ mode: "all" });
    const lines = all.csv.split("\n");
    expect(lines[0]).toBe(HEADER);
    const ownRow = lines.find((l) => l.startsWith(`${own},`));
    expect(ownRow).toBeDefined();
    expect(ownRow).toContain(",Owned,A,");
    expect(ownRow!.endsWith(",model")).toBe(true);
    const otherRow = lines.find((l) => l.startsWith(`${other},`));
    expect(otherRow!.endsWith(",collection")).toBe(true);

    // Filter scope: only model matches → excludes the collection row.
    const filtered = await exportMatchedClientsCsv({ mode: "filter", owners: [], matchTypes: ["model"], brands: [] });
    expect(filtered.csv).toContain(`${own},`);
    expect(filtered.csv).not.toContain(`${other},`);

    // Associate scope: only own client.
    vi.mocked(getServerSession).mockResolvedValue(assoc as never);
    const scoped = await exportMatchedClientsCsv({ mode: "all" });
    expect(scoped.csv).toContain(`${own},`);
    expect(scoped.csv).not.toContain(`${other},`);
  });
});
