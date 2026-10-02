import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { modelCatalog } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { listCatalog } from "@/lib/actions";

// Regression (m2): listCatalog built its LIKE patterns by hand, so `_` and `%`
// in a search acted as wildcards, and an out-of-range ?page= rendered an empty
// table instead of the last page.

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

const P = `LIKECAT${Date.now()}`;
const MODELS = [`${P}_A1`, `${P}XA1`, `${P}%B2`, `${P}PB2`];

beforeAll(() => {
  vi.mocked(getServerSession).mockResolvedValue(managerSession as never);
  for (const model of MODELS) {
    db.insert(modelCatalog).values({ model, collection: model.includes("%") ? "PCT%COLL" : "PLAINCOLL", source: "manual" }).run();
  }
});

afterAll(() => {
  db.delete(modelCatalog).where(inArray(modelCatalog.model, MODELS)).run();
});

describe("listCatalog search and paging", () => {
  it("matches `_` and `%` literally, not as wildcards", async () => {
    expect((await listCatalog({ mod: `${P}_` })).rows.map((r) => r.model)).toEqual([`${P}_A1`]);
    expect((await listCatalog({ mod: `${P}%` })).rows.map((r) => r.model)).toEqual([`${P}%B2`]);
    expect((await listCatalog({ mod: P, col: "T%C" })).rows.map((r) => r.model)).toEqual([`${P}%B2`]);
  });

  it("still matches a plain substring", async () => {
    expect((await listCatalog({ mod: P })).total).toBe(MODELS.length);
  });

  it("clamps an out-of-range page to the last page", async () => {
    const result = await listCatalog({ mod: P, page: 999 });
    expect(result.page).toBe(1);
    expect(result.rows).toHaveLength(MODELS.length);
  });
});
