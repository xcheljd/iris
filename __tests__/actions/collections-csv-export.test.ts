import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { exportCollectionsCsv } from "@/lib/actions/collections-csv-export";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";
const mgr = { user: { id: MANAGER_ID, name: "Marcus", role: "manager" } };
const assoc = { user: { id: ASSOCIATE_ID, name: "Jordan", role: "associate" } };

describe("exportCollectionsCsv", () => {
  const ids: string[] = [];

  beforeEach(() => vi.mocked(getServerSession).mockResolvedValue(mgr as never));
  afterEach(() => {
    for (const id of ids) { try { db.delete(clients).where(eq(clients.id, id)).run(); } catch { /* */ } }
    ids.length = 0;
  });

  function addClient(firstName: string, poi: { model: string | null; collection: string | null; brand: null, intent: "interested" | "promo" | "arrival" }[], employeeId?: string) {
    const id = randomUUID();
    ids.push(id);
    db.insert(clients).values({ id, firstName, lastName: "Tester", productsOfInterest: poi, employeeId: employeeId ?? MANAGER_ID }).run();
    return id;
  }

  const rowsFor = (csv: string, firstName: string) =>
    csv.split("\n").slice(1).filter((l) => l.includes(`,${firstName},`));

  it("emits the fixed header", async () => {
    const { csv } = await exportCollectionsCsv({ mode: "all" });
    expect(csv.split("\n")[0]).toBe("Collection,Model,First Name,Last Name,Phone,Email,Owner,Intents");
  });

  it("CRIMSON ACE: collection-only + model entry → two rows, intents aggregated", async () => {
    const fn = `BA${Date.now()}`;
    addClient(fn, [
      { model: null, collection: "CRIMSON ACE", brand: null, intent: "interested" },
      { model: "HX1005-01X", collection: "CRIMSON ACE", brand: null, intent: "promo" },
    ]);
    const { csv } = await exportCollectionsCsv({ mode: "all" });
    const rows = rowsFor(csv, fn);
    expect(rows).toHaveLength(2);
    // Both rows: collection CRIMSON ACE, aggregated intents "interested; promo"
    expect(rows.some((r) => r.startsWith("CRIMSON ACE,,"))).toBe(true);
    expect(rows.some((r) => r.startsWith("CRIMSON ACE,HX1005-01X,"))).toBe(true);
    for (const r of rows) expect(r.endsWith(",interested; promo")).toBe(true);
  });

  it("excludes model-only (no collection) entries", async () => {
    const fn = `MO${Date.now()}`;
    addClient(fn, [{ model: "LX1012-01X", collection: null, brand: null, intent: "interested" }]);
    const { csv } = await exportCollectionsCsv({ mode: "all" });
    expect(rowsFor(csv, fn)).toHaveLength(0);
  });

  it("aggregates distinct intents in canonical order", async () => {
    const fn = `AG${Date.now()}`;
    addClient(fn, [
      { model: "M1", collection: "Sentinel", brand: null, intent: "arrival" },
      { model: "M1", collection: "Sentinel", brand: null, intent: "interested" },
    ]);
    const { csv } = await exportCollectionsCsv({ mode: "all" });
    const rows = rowsFor(csv, fn);
    expect(rows).toHaveLength(1); // same (collection, model) collapses
    expect(rows[0].endsWith(",interested; arrival")).toBe(true);
  });

  it("scope: selected (exact) and filter (case-insensitive substring)", async () => {
    const fn = `SC${Date.now()}`;
    addClient(fn, [
      { model: "X1", collection: "Solaris", brand: null, intent: "promo" },
      { model: "Y1", collection: "Sentinel", brand: null, intent: "promo" },
    ]);
    const sel = await exportCollectionsCsv({ mode: "selected", collection: "Solaris" });
    const selRows = rowsFor(sel.csv, fn);
    expect(selRows).toHaveLength(1);
    expect(selRows[0].startsWith("Solaris,")).toBe(true);

    const filt = await exportCollectionsCsv({ mode: "filter", query: "eco" });
    expect(rowsFor(filt.csv, fn).every((r) => r.startsWith("Solaris,"))).toBe(true);
  });

  it("associate sees only their own clients", async () => {
    const own = `OWN${Date.now()}`;
    const other = `OTH${Date.now()}`;
    addClient(own, [{ model: null, collection: "Octa", brand: null, intent: "promo" }], ASSOCIATE_ID);
    addClient(other, [{ model: null, collection: "Octa", brand: null, intent: "promo" }], MANAGER_ID);
    vi.mocked(getServerSession).mockResolvedValue(assoc as never);
    const { csv } = await exportCollectionsCsv({ mode: "all" });
    expect(rowsFor(csv, own)).toHaveLength(1);
    expect(rowsFor(csv, other)).toHaveLength(0);
  });
});
