/**
 * Characterization tests for getClientsWithEmployeePaginated (TEST-01).
 *
 * The read layer every clients page renders through previously had no direct
 * tests. These pin: ownership scoping, pagination math, sort-key ordering,
 * and the name-search branch — against deterministic fixtures inserted here
 * (never the shared setup.ts client, whose ambient owner we must not assume).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { clients, smartLists } from "@/lib/db/schema";
import { eq, inArray, and, notInArray } from "drizzle-orm";
import {
  getClientsWithEmployeePaginated,
  getAllSmartListCounts,
  getCustomListClients,
  getSmartLists,
} from "@/lib/queries";

const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";

// Deterministic fixture names, heat scores, and recency so ordering
// assertions don't depend on seed data.
const FIXTURES = [
  { id: randomUUID(), first: "Zeb", last: "Zebrowski", heat: 90, outreachDaysAgo: 1 },
  { id: randomUUID(), first: "Yvonne", last: "Yaz", heat: 70, outreachDaysAgo: 5 },
  { id: randomUUID(), first: "Xander", last: "Xylo", heat: 50, outreachDaysAgo: 30 },
  { id: randomUUID(), first: "Wanda", last: "Wex", heat: 30, outreachDaysAgo: 200 },
  { id: randomUUID(), first: "Vera", last: "Vance", heat: 10, outreachDaysAgo: 400 },
] as const;

const createdIds: string[] = [];

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

beforeAll(() => {
  for (const f of FIXTURES) {
    db.insert(clients)
      .values({
        id: f.id,
        firstName: f.first,
        lastName: f.last,
        employeeId: ASSOCIATE_ID,
        status: "active",
        onEmailList: true,
        heatScore: f.heat,
        lastOutreachAt: daysAgo(f.outreachDaysAgo),
        dateAdded: new Date(),
        createdAt: new Date(),
      })
      .run();
    createdIds.push(f.id);
  }
});

afterAll(() => {
  if (createdIds.length) db.delete(clients).where(inArray(clients.id, createdIds)).run();
});

function idsOf(result: { rows: Array<{ client: { id: string } }> }): string[] {
  return result.rows.map((r) => r.client.id);
}

describe("getClientsWithEmployeePaginated", () => {
  it("scopes an associate to their own clients and a manager to all", async () => {
    const scoped = await getClientsWithEmployeePaginated(ASSOCIATE_ID, { pageSize: 500 });
    const expected = db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.employeeId, ASSOCIATE_ID), notInArray(clients.status, ["banned", "deleted"])))
      .all()
      .map((r) => r.id);
    expect(expected).toContain(FIXTURES[0].id);
    expect(scoped.rows.map((r) => r.client.id).sort()).toEqual([...expected].sort());

    const manager = await getClientsWithEmployeePaginated(undefined, { pageSize: 10_000 });
    expect(manager.total).toBeGreaterThanOrEqual(expected.length);
  });

  it("returns page-1 rows within pageSize and empty pages past the end", async () => {
    const page1 = await getClientsWithEmployeePaginated(ASSOCIATE_ID, { page: 1, pageSize: 2 });
    expect(page1.rows).toHaveLength(2);
    expect(page1.total).toBeGreaterThanOrEqual(5); // our five fixtures are all in scope

    const pastEnd = await getClientsWithEmployeePaginated(ASSOCIATE_ID, { page: 10_000, pageSize: 2 });
    expect(pastEnd.rows).toHaveLength(0);
    expect(pastEnd.total).toBe(page1.total);
  });

  it("sorts by heat (default desc), name asc, and lastContact desc", async () => {
    const byHeat = await getClientsWithEmployeePaginated(ASSOCIATE_ID, { sort: "heat", sortDir: "desc", pageSize: 10_000 });
    const heatIds = idsOf(byHeat);
    for (let i = 0; i < FIXTURES.length - 1; i++) {
      expect(heatIds.indexOf(FIXTURES[i].id)).toBeLessThan(heatIds.indexOf(FIXTURES[i + 1].id));
    }

    const byName = await getClientsWithEmployeePaginated(ASSOCIATE_ID, { sort: "name", sortDir: "asc", pageSize: 10_000 });
    const nameIds = idsOf(byName);
    for (let i = 0; i < FIXTURES.length - 1; i++) {
      // Fixture first names are in DESCENDING alpha order (Z..V), so ascending
      // name sort must place them in reverse fixture-index order.
      expect(nameIds.indexOf(FIXTURES[i].id)).toBeGreaterThan(nameIds.indexOf(FIXTURES[i + 1].id));
    }

    const byContact = await getClientsWithEmployeePaginated(ASSOCIATE_ID, { sort: "lastContact", sortDir: "desc", pageSize: 10_000 });
    const contactIds = idsOf(byContact);
    for (let i = 0; i < FIXTURES.length - 1; i++) {
      // Zeb (1 day) most recent ... Vera (400 days) oldest.
      expect(contactIds.indexOf(FIXTURES[i].id)).toBeLessThan(contactIds.indexOf(FIXTURES[i + 1].id));
    }
  });

  it("narrows on nameQ search and adjusts the total", async () => {
    const search = await getClientsWithEmployeePaginated(ASSOCIATE_ID, { nameQ: "Zebrowski", pageSize: 100 });
    expect(search.total).toBe(1);
    expect(idsOf(search)).toEqual([FIXTURES[0].id]);
  });
});

describe("getAllSmartListCounts vs list contents", () => {
  it("counts an empty custom filter consistently with getCustomListClients", async () => {
    const listId = randomUUID();
    db.insert(smartLists).values({ id: listId, name: "char-count-list", ownerId: null, filters: {}, isShared: true }).run();
    try {
      const lists = await getSmartLists(ASSOCIATE_ID);
      const mine = lists.find((l) => l.id === listId);
      expect(mine).toBeDefined();
      const { custom } = await getAllSmartListCounts(lists, ASSOCIATE_ID);
      const contents = await getCustomListClients({}, ASSOCIATE_ID);
      expect(custom[listId]).toBe(contents.rows.length);
    } finally {
      db.delete(smartLists).where(eq(smartLists.id, listId)).run();
    }
  });
});