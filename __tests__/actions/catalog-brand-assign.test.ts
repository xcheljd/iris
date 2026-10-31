import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { modelCatalog } from "@/lib/db/schema";
import { eq, like } from "drizzle-orm";
import { randomUUID } from "crypto";
import { analyzeCatalogImport, importCatalog } from "@/lib/actions";

const managerSession: Session = {
  user: { id: "2d7a352d-53a0-4544-b515-902e7dd59206", name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};
const T = randomUUID().slice(0, 6).toUpperCase();
const M = (n: number) => `CBA${T}-${n}`;

describe("catalog import brand assignment", () => {
  beforeEach(() => vi.mocked(getServerSession).mockResolvedValue(managerSession as never));
  afterEach(() => { db.delete(modelCatalog).where(like(modelCatalog.model, `CBA${T}-%`)).run(); });

  const file = [
    "Brand,Collection,Model,MSRP",
    `Vellamy,RIDGE${T},${M(1)},500`,
    `,RIDGE${T},${M(2)},500`,
    `Vellammy,OTHER${T},${M(3)},500`,
    `,LONE${T},${M(4)},500`,
  ].join("\n");

  it("lists rows left without a brand, with suggestions from the file itself", async () => {
    const a = await analyzeCatalogImport(file);
    if ("error" in a) throw new Error(a.error);
    const by = new Map(a.brandRows.map((r) => [r.model, r]));
    expect([...by.keys()].sort()).toEqual([M(2), M(3), M(4)]);
    expect(by.get(M(2))!.suggestion).toMatchObject({ brand: "Vellamy", source: "collection" });
    expect(by.get(M(3))!.suggestion).toMatchObject({ brand: "Vellamy", source: "sheet-typo" });
    expect(by.get(M(4))!.suggestion.brand).toBeNull();
    expect(a.parseErrors).toEqual([]);
  });

  it("applies picked brands, marking kept suggestions for review", async () => {
    const res = await importCatalog(file, {
      [M(2)]: { brand: "Vellamy", suggested: true },
      [M(4)]: { brand: "aldermoor", suggested: false },
      [M(3)]: { brand: "Not A Brand", suggested: false },
    });
    expect(res).toMatchObject({ created: 4 });
    const cat = (m: string) => db.select().from(modelCatalog).where(eq(modelCatalog.model, m)).get();
    expect(cat(M(1))).toMatchObject({ brand: "Vellamy", needsReview: false });
    expect(cat(M(2))).toMatchObject({ brand: "Vellamy", needsReview: true });
    expect(cat(M(4))).toMatchObject({ brand: "Aldermoor", needsReview: false });
    expect(cat(M(3))?.brand ?? null).toBeNull();
  });
});
