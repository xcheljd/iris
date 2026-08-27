/**
 * Parity characterization for getAllSmartListCounts (PERF-04).
 *
 * The counts used to be computed by loading every client into JS and
 * re-implementing each filter as an array `.filter()` chain. This file pins
 * the *outputs* of that JS implementation (reproduced verbatim below as an
 * oracle) so the SQL COUNT(*) rewrite can be proven output-identical.
 *
 * Known intentional divergence: the JS oracle skipped the `owner` filter
 * entirely (its projection had no employees join), so an owner-filtered
 * smart list counted every client instead of the owner's. The SQL path
 * honours `owner`, which is what the list *contents* query already did.
 * That case is asserted against getCustomListClients, not against the oracle.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { clients, smartLists } from "@/lib/db/schema";
import { eq, notInArray, and, inArray } from "drizzle-orm";
import { getAllSmartListCounts, getCustomListClients, getSmartLists, BUILTIN_FILTER_IDS } from "@/lib/queries";
import { applyClientFilter } from "@/lib/utils";
import { smartListToClientFilters } from "@/lib/smart-list-filters";
import { MS_PER_DAY } from "@/lib/constants";

const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";

type Row = {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  onEmailList: boolean;
  status: string;
  birthday: string | null;
  tags: unknown;
  heatLevel: string;
  lastOutreachAt: Date | null;
  lastPurchaseAt: Date | null;
  createdAt: Date;
};

/** Verbatim copy of the pre-refactor JS count implementation. */
function legacyCountCustomFilter(all: Row[], filters: Record<string, unknown>): number {
  const now = Date.now();
  const staleMs = 90 * MS_PER_DAY;
  let result = all;

  if (filters.source) result = result.filter((c) => c.source === String(filters.source));
  if (filters.onEmailList) result = result.filter((c) => c.onEmailList);
  if (filters.stale) {
    result = result.filter((c) => {
      if (c.status !== "active") return false;
      if (!c.lastOutreachAt && !c.lastPurchaseAt) return true;
      const last = Math.max(
        c.lastOutreachAt ? new Date(c.lastOutreachAt).getTime() : 0,
        c.lastPurchaseAt ? new Date(c.lastPurchaseAt).getTime() : 0,
      );
      return last < now - staleMs;
    });
  }
  if (filters.birthdayMonth) {
    const m = String(filters.birthdayMonth).padStart(2, "0");
    result = result.filter((c) => c.birthday?.split("-")[1] === m);
  }

  const f = smartListToClientFilters(filters);
  if (f.q) {
    const q = f.q.toLowerCase();
    result = result.filter((c) =>
      `${c.firstName} ${c.lastName ?? ""}`.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").includes(q),
    );
  }
  if (f.nameQ) {
    const nq = f.nameQ.toLowerCase();
    result = result.filter((c) => `${c.firstName} ${c.lastName ?? ""}`.toLowerCase().includes(nq));
  }
  if (f.contactQ) {
    const cq = f.contactQ.toLowerCase();
    result = result.filter((c) =>
      (c.email ?? "").toLowerCase().includes(cq) || (c.phone ?? "").includes(cq),
    );
  }
  if (f.heat) result = result.filter((c) => c.heatLevel === f.heat);
  if (f.tags && f.tags.length > 0) {
    const wanted = f.tags;
    if (f.tagMode === "all") {
      result = result.filter((c) => {
        const tags = Array.isArray(c.tags) ? (c.tags as string[]) : [];
        return wanted.every((t) => tags.includes(t));
      });
    } else {
      result = result.filter((c) => {
        const tags = Array.isArray(c.tags) ? (c.tags as string[]) : [];
        return wanted.some((t) => tags.includes(t));
      });
    }
  }
  if (f.lastContactFrom !== undefined) {
    result = result.filter((c) => c.lastOutreachAt && new Date(c.lastOutreachAt).getTime() / 1000 >= f.lastContactFrom!);
  }
  if (f.lastContactTo !== undefined) {
    result = result.filter((c) => c.lastOutreachAt && new Date(c.lastOutreachAt).getTime() / 1000 <= f.lastContactTo!);
  }
  if (f.createdFrom !== undefined) {
    result = result.filter((c) => new Date(c.createdAt).getTime() / 1000 >= f.createdFrom!);
  }
  if (f.createdTo !== undefined) {
    result = result.filter((c) => new Date(c.createdAt).getTime() / 1000 <= f.createdTo!);
  }

  return result.length;
}

function loadAll(employeeId?: string): Row[] {
  return db
    .select({
      firstName: clients.firstName,
      lastName: clients.lastName,
      email: clients.email,
      phone: clients.phone,
      source: clients.source,
      onEmailList: clients.onEmailList,
      status: clients.status,
      birthday: clients.birthday,
      tags: clients.tags,
      heatLevel: clients.heatLevel,
      lastOutreachAt: clients.lastOutreachAt,
      lastPurchaseAt: clients.lastPurchaseAt,
      createdAt: clients.createdAt,
    })
    .from(clients)
    .where(and(
      notInArray(clients.status, ["banned", "deleted"]),
      employeeId ? eq(clients.employeeId, employeeId) : undefined,
    ))
    .all() as Row[];
}

const createdListIds: string[] = [];

function makeList(name: string, filters: Record<string, unknown>) {
  const id = randomUUID();
  db.insert(smartLists).values({ id, name, ownerId: null, filters, isShared: true }).run();
  createdListIds.push(id);
  return id;
}

let sampleTag: string | undefined;
let sampleSource: string | undefined;

beforeAll(() => {
  const withTags = db.select({ tags: clients.tags, source: clients.source }).from(clients).all();
  for (const r of withTags) {
    const t = Array.isArray(r.tags) ? (r.tags as string[]) : [];
    if (!sampleTag && t.length > 0) sampleTag = t[0];
    if (!sampleSource && r.source) sampleSource = r.source;
  }
});

afterAll(() => {
  if (createdListIds.length) {
    db.delete(smartLists).where(inArray(smartLists.id, createdListIds)).run();
  }
});

describe("getAllSmartListCounts parity", () => {
  it("built-in counts match the JS filter for every built-in list", async () => {
    const all = loadAll();
    const { builtIn } = await getAllSmartListCounts([]);
    expect(Object.keys(builtIn).sort()).toEqual([...BUILTIN_FILTER_IDS].sort());
    for (const filter of BUILTIN_FILTER_IDS) {
      expect(builtIn[filter], `built-in "${filter}"`).toBe(applyClientFilter(all, filter).length);
    }
  });

  it("built-in counts match the JS filter when scoped to one employee", async () => {
    const all = loadAll(ASSOCIATE_ID);
    const { builtIn } = await getAllSmartListCounts([], ASSOCIATE_ID);
    for (const filter of BUILTIN_FILTER_IDS) {
      expect(builtIn[filter], `built-in "${filter}" (scoped)`).toBe(applyClientFilter(all, filter).length);
    }
  });

  it("custom counts match the JS filter across condition types", async () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["heat (legacy heatLevel key)", { heatLevel: "hot" }],
      ["heat (new key)", { heat: "warm" }],
      ["stale flag", { stale: true }],
      ["onEmailList flag", { onEmailList: true }],
      ["birthday month", { birthdayMonth: "3" }],
      ["name substring", { nameQ: "a" }],
      ["contact substring", { contactQ: "@" }],
      ["created range", { createdFrom: 0, createdTo: Math.floor(Date.now() / 1000) }],
      ["last contact range", { lastContactFrom: 0, lastContactTo: Math.floor(Date.now() / 1000) }],
      ["empty filter blob", {}],
    ];
    if (sampleSource) cases.push(["source", { source: sampleSource }]);
    if (sampleTag) {
      cases.push(["tags any", { tags: [sampleTag] }]);
      cases.push(["tags all (legacy single tag)", { tag: sampleTag }]);
      cases.push(["tags all mode", { tags: [sampleTag], tagMode: "all" }]);
    }
    cases.push(["combined heat + stale + email", { heat: "hot", stale: true, onEmailList: true }]);

    const lists = cases.map(([label, filters]) => ({ label, filters, id: makeList(`parity ${label}`, filters) }));
    const all = loadAll();
    const { custom } = await getAllSmartListCounts(
      lists.map((l) => ({ id: l.id, filters: l.filters })) as unknown as Awaited<ReturnType<typeof getSmartLists>>,
    );

    for (const l of lists) {
      expect(custom[l.id], `custom "${l.label}"`).toBe(legacyCountCustomFilter(all, l.filters));
    }
  });

  it("custom counts match the JS filter when scoped to one employee", async () => {
    const id = makeList("parity scoped", { heat: "hot" });
    const all = loadAll(ASSOCIATE_ID);
    const { custom } = await getAllSmartListCounts(
      [{ id, filters: { heat: "hot" } }] as unknown as Awaited<ReturnType<typeof getSmartLists>>,
      ASSOCIATE_ID,
    );
    expect(custom[id]).toBe(legacyCountCustomFilter(all, { heat: "hot" }));
  });

  // The `q` branch is the other genuine divergence from the JS oracle: the
  // legacy code ran substring includes() over name/email/phone, while the SQL
  // path goes through toFtsQuery -> clients_fts MATCH (tokenized, and also
  // covering notes/products). Pin it against the list contents, not the oracle.
  it("a q-filtered list counts what the list actually contains", async () => {
    const seedClient = db
      .select({ firstName: clients.firstName })
      .from(clients)
      .where(notInArray(clients.status, ["banned", "deleted"]))
      .get();
    const filters = { q: seedClient!.firstName };
    const id = makeList("parity q", filters);

    const { custom } = await getAllSmartListCounts(
      [{ id, filters }] as unknown as Awaited<ReturnType<typeof getSmartLists>>,
    );
    const { rows } = await getCustomListClients(filters);

    expect(rows.length).toBeGreaterThan(0); // not a vacuous 0 === 0
    expect(custom[id]).toBe(rows.length);
  });

  it("a q-filtered list counts what the list actually contains when scoped to one employee", async () => {
    const owned = db
      .select({ firstName: clients.firstName })
      .from(clients)
      .where(and(eq(clients.employeeId, ASSOCIATE_ID), notInArray(clients.status, ["banned", "deleted"])))
      .get();
    const filters = { q: owned!.firstName };
    const id = makeList("parity q scoped", filters);

    const { custom } = await getAllSmartListCounts(
      [{ id, filters }] as unknown as Awaited<ReturnType<typeof getSmartLists>>,
      ASSOCIATE_ID,
    );
    const { rows } = await getCustomListClients(filters, ASSOCIATE_ID);

    expect(rows.length).toBeGreaterThan(0);
    expect(custom[id]).toBe(rows.length);
  });

  it("an owner-filtered list counts what the list actually contains", async () => {
    const filters = { owner: "Test Associate" };
    const id = makeList("parity owner", filters);
    const { custom } = await getAllSmartListCounts(
      [{ id, filters }] as unknown as Awaited<ReturnType<typeof getSmartLists>>,
    );
    const { rows } = await getCustomListClients(filters);
    expect(custom[id]).toBe(rows.length);
  });
});
