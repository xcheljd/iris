import { db } from "@/lib/db";
import { clients, outreachLogs, activityEvents, promoWatches, promoMatches, bannedCustomers, unsubscribeList, employees, clientTags, outreachTemplates, smartLists, rvxImportBatches, prospects } from "@/lib/db/schema";
import { eq, desc, asc, and, or, isNull, isNotNull, lte, gte, notInArray, sql as rawSql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { applyClientFilter } from "@/lib/utils";
import { buildClientFilterConds } from "@/lib/client-filter-conds";
import { smartListToClientFilters } from "@/lib/smart-list-filters";
import { toFtsQuery } from "@/lib/fts";
import { getCatalogMap } from "@/lib/actions/model-catalog";
import { MS_PER_DAY, SEC_PER_DAY, LIST_QUERY_LIMIT, FOLLOW_UP_LOOKAHEAD_DAYS, DEFAULT_PAGE_SIZE } from "@/lib/constants";

const clientListProjection = {
  id: clients.id,
  customerId: clients.customerId,
  firstName: clients.firstName,
  lastName: clients.lastName,
  phone: clients.phone,
  email: clients.email,
  employeeId: clients.employeeId,
  dateAdded: clients.dateAdded,
  productsOfInterest: clients.productsOfInterest,
  onEmailList: clients.onEmailList,
  status: clients.status,
  source: clients.source,
  birthday: clients.birthday,
  anniversary: clients.anniversary,
  tags: clients.tags,
  heatScore: clients.heatScore,
  heatLevel: clients.heatLevel,
  lastOutreachAt: clients.lastOutreachAt,
  lastPurchaseAt: clients.lastPurchaseAt,
  createdAt: clients.createdAt,
  updatedAt: clients.updatedAt,
};

export async function getAllClients(employeeId?: string) {
  const employeeFilter = employeeId ? eq(clients.employeeId, employeeId) : undefined;
  return db.select(clientListProjection).from(clients).where(and(notInArray(clients.status, ["banned", "deleted"]), employeeFilter)).orderBy(desc(clients.heatScore)).limit(LIST_QUERY_LIMIT).all();
}

export type ClientListRow = Awaited<ReturnType<typeof getAllClients>>[number];

export async function getTopHotClients(employeeId?: string, limit = 6) {
  const employeeFilter = employeeId ? eq(clients.employeeId, employeeId) : undefined;
  return db
    .select(clientListProjection)
    .from(clients)
    .where(and(eq(clients.heatLevel, "hot"), eq(clients.status, "active"), employeeFilter))
    .orderBy(desc(clients.heatScore))
    .limit(limit)
    .all();
}

export async function getClientsBirthdayCurrentMonth(employeeId?: string) {
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const employeeFilter = employeeId ? eq(clients.employeeId, employeeId) : undefined;
  return db
    .select(clientListProjection)
    .from(clients)
    .where(and(eq(clients.status, "active"), isNotNull(clients.birthday), rawSql`substr(${clients.birthday}, 6, 2) = ${month}`, employeeFilter))
    .orderBy(rawSql`substr(${clients.birthday}, 9, 2)`)
    .all();
}

export async function getClientOwnerNames(employeeId?: string): Promise<string[]> {
  const employeeFilter = employeeId ? eq(clients.employeeId, employeeId) : undefined;
  const rows = db
    .selectDistinct({
      name: rawSql<string>`NULLIF(TRIM(COALESCE(${employees.firstName}, '') || ' ' || COALESCE(${employees.lastName}, '')), '')`,
    })
    .from(clients)
    .leftJoin(employees, eq(clients.employeeId, employees.id))
    .where(and(notInArray(clients.status, ["banned", "deleted"]), isNotNull(clients.employeeId), employeeFilter))
    .all();
  return rows.map((r) => r.name).filter((n): n is string => Boolean(n)).sort();
}

export type ClientSortKey = "name" | "heat" | "lastContact" | "owner";

export async function getClientsWithEmployeePaginated(
  employeeId: string | undefined,
  opts: {
    q?: string;
    /** Column-scoped: matches first/last name only. */
    nameQ?: string;
    /** Column-scoped: matches email or phone only. */
    contactQ?: string;
    heat?: string;
    owner?: string;
    filter?: string;
    tags?: string[];
    tagMode?: "any" | "all";
    /** Last-outreach lower bound, unix seconds. */
    lastContactFrom?: number;
    /** Last-outreach upper bound, unix seconds (exclusive end-of-day handled by caller). */
    lastContactTo?: number;
    /** Created-at lower bound, unix seconds. */
    createdFrom?: number;
    /** Created-at upper bound, unix seconds. */
    createdTo?: number;
    sort?: ClientSortKey;
    sortDir?: "asc" | "desc";
    page?: number;
    pageSize?: number;
  },
) {
  const { q, nameQ, contactQ, heat, owner, filter, tags, tagMode = "any", lastContactFrom, lastContactTo, createdFrom, createdTo, sort = "heat", sortDir = "desc", page = 1, pageSize = DEFAULT_PAGE_SIZE } = opts;
  const nowSec = Math.floor(Date.now() / 1000);

  const { conds: filterConds } = buildClientFilterConds({
    q, nameQ, contactQ, heat, owner, tags, tagMode,
    lastContactFrom, lastContactTo, createdFrom, createdTo,
  });
  const conds: (SQL<unknown> | undefined)[] = [
    notInArray(clients.status, ["banned", "deleted"]),
    employeeId ? eq(clients.employeeId, employeeId) : undefined,
    ...filterConds,
  ];

  if (filter && filter !== "all") {
    switch (filter) {
      case "hot":
        conds.push(eq(clients.heatLevel, "hot"), eq(clients.status, "active"));
        break;
      case "stale":
        conds.push(
          eq(clients.status, "active"),
          or(
            and(isNull(clients.lastOutreachAt), isNull(clients.lastPurchaseAt)),
            rawSql`MAX(COALESCE(${clients.lastOutreachAt}, 0), COALESCE(${clients.lastPurchaseAt}, 0)) < ${nowSec - 90 * SEC_PER_DAY}`,
          ),
        );
        break;
      case "recent_purchases":
        conds.push(rawSql`${clients.lastPurchaseAt} > ${nowSec - 30 * SEC_PER_DAY}`);
        break;
      case "no_outreach_60":
        conds.push(
          eq(clients.status, "active"),
          or(isNull(clients.lastOutreachAt), rawSql`${clients.lastOutreachAt} < ${nowSec - 60 * SEC_PER_DAY}`),
        );
        break;
      case "birthdays_month": {
        const bmonth = String(new Date().getMonth() + 1).padStart(2, "0");
        conds.push(rawSql`substr(${clients.birthday}, 6, 2) = ${bmonth}`);
        break;
      }
      case "email_subscribers":
        conds.push(eq(clients.onEmailList, true), rawSql`${clients.status} != 'unsubscribed'`);
        break;
    }
  }

  const whereClause = and(...conds);
  const dirFn = sortDir === "asc" ? asc : desc;

  let orderClauses: SQL<unknown>[];
  switch (sort) {
    case "name":
      orderClauses = [dirFn(clients.firstName) as SQL<unknown>, dirFn(rawSql`COALESCE(${clients.lastName}, '')`) as SQL<unknown>];
      break;
    case "lastContact":
      orderClauses = [dirFn(rawSql`COALESCE(${clients.lastOutreachAt}, 0)`) as SQL<unknown>];
      break;
    case "owner":
      orderClauses = [dirFn(rawSql`TRIM(COALESCE(${employees.firstName}, '') || ' ' || COALESCE(${employees.lastName}, ''))`) as SQL<unknown>];
      break;
    case "heat":
    default:
      orderClauses = [dirFn(clients.heatScore) as SQL<unknown>];
  }

  const baseSelect = db
    .select({
      client: clientListProjection,
      employeeName: rawSql<string | null>`NULLIF(TRIM(COALESCE(${employees.firstName}, '') || ' ' || COALESCE(${employees.lastName}, '')), '')`,
    })
    .from(clients)
    .leftJoin(employees, eq(clients.employeeId, employees.id))
    .where(whereClause);

  const [countRow] = db
    .select({ total: rawSql<number>`count(*)` })
    .from(clients)
    .leftJoin(employees, eq(clients.employeeId, employees.id))
    .where(whereClause)
    .all();

  const rows = baseSelect.orderBy(...orderClauses).limit(pageSize).offset((page - 1) * pageSize).all();

  return { rows, total: countRow?.total ?? 0 };
}

export async function getClient(id: string) {
  return db.select().from(clients).where(eq(clients.id, id)).get();
}

export async function getClientsWithEmployee(employeeId?: string) {
  const employeeFilter = employeeId ? eq(clients.employeeId, employeeId) : undefined;
  const rows = db.select({
    client: clientListProjection,
    employeeName: rawSql`COALESCE(${employees.firstName}, '') || ' ' || COALESCE(${employees.lastName}, '')`,
  }).from(clients).leftJoin(employees, eq(clients.employeeId, employees.id)).where(and(notInArray(clients.status, ["banned", "deleted"]), employeeFilter)).orderBy(desc(clients.heatScore)).limit(LIST_QUERY_LIMIT).all();
  return rows;
}

function queryFollowUps(from: Date | null, to: Date, employeeId?: string) {
  const employeeFilter = employeeId ? eq(outreachLogs.employeeId, employeeId) : undefined;
  return db.select({
    log: outreachLogs,
    client: clients,
    employee: employees,
  }).from(outreachLogs)
    .leftJoin(clients, eq(outreachLogs.clientId, clients.id))
    .leftJoin(employees, eq(outreachLogs.employeeId, employees.id))
    .where(and(
      isNotNull(outreachLogs.followUpDate),
      eq(outreachLogs.completed, false),
      from ? gte(outreachLogs.followUpDate, from) : undefined,
      lte(outreachLogs.followUpDate, to),
      employeeFilter,
    ))
    .orderBy(outreachLogs.followUpDate)
    .all();
}

export async function getUpcomingFollowUps(employeeId?: string) {
  const now = new Date();
  const in7d = new Date(Date.now() + FOLLOW_UP_LOOKAHEAD_DAYS * MS_PER_DAY);
  return queryFollowUps(now, in7d, employeeId);
}

export async function getOverdueFollowUps(employeeId?: string) {
  return queryFollowUps(null, new Date(), employeeId);
}

export async function getStats(employeeId?: string) {
  const clientFilter = employeeId ? eq(clients.employeeId, employeeId) : undefined;
  const outreachFilter = employeeId ? eq(outreachLogs.employeeId, employeeId) : undefined;

  const clientStats = db.select({
    total: rawSql<number>`sum(case when ${clients.status} != 'deleted' then 1 else 0 end)`,
    active: rawSql<number>`sum(case when ${clients.status} = 'active' then 1 else 0 end)`,
    hot: rawSql<number>`sum(case when ${clients.heatLevel} = 'hot' and ${clients.status} = 'active' then 1 else 0 end)`,
    warm: rawSql<number>`sum(case when ${clients.heatLevel} = 'warm' and ${clients.status} = 'active' then 1 else 0 end)`,
    cold: rawSql<number>`sum(case when ${clients.heatLevel} = 'cold' and ${clients.status} = 'active' then 1 else 0 end)`,
  }).from(clients).where(clientFilter).get();

  const banned = db.select({ c: rawSql<number>`count(*)` }).from(bannedCustomers).get();
  const unsubscribed = db.select({ c: rawSql<number>`count(*)` }).from(unsubscribeList).get();

  const weekAgo = new Date(Date.now() - FOLLOW_UP_LOOKAHEAD_DAYS * MS_PER_DAY);
  const outreachStats = db.select({
    outreachWeek: rawSql<number>`count(*)`,
    purchasesWeek: rawSql<number>`sum(case when ${outreachLogs.outcome} = 'purchased' then 1 else 0 end)`,
  }).from(outreachLogs).where(and(gte(outreachLogs.date, weekAgo), outreachFilter)).get();

  return {
    total: clientStats?.total ?? 0,
    active: clientStats?.active ?? 0,
    hot: clientStats?.hot ?? 0,
    warm: clientStats?.warm ?? 0,
    cold: clientStats?.cold ?? 0,
    banned: banned?.c ?? 0,
    unsubscribed: unsubscribed?.c ?? 0,
    outreachWeek: outreachStats?.outreachWeek ?? 0,
    purchasesWeek: outreachStats?.purchasesWeek ?? 0,
  };
}

export async function getPromos() {
  return db.select().from(promoWatches).orderBy(desc(promoWatches.dateAdded)).limit(LIST_QUERY_LIMIT).all();
}

// Distinct matched-client count per promo, excluding deleted/soft-deleted
// and orphaned clients (mirrors what View Matches shows). One row per
// (client, promo) is guaranteed by the promo_matches unique constraint,
// so count(*) == distinct clients.
export async function getPromoMatchCounts(): Promise<Record<string, number>> {
  const rows = db
    .select({ promoId: promoMatches.promoId, n: rawSql<number>`count(*)` })
    .from(promoMatches)
    .leftJoin(clients, eq(promoMatches.clientId, clients.id))
    .where(and(isNull(clients.deletedAt), notInArray(clients.status, ["deleted"])))
    .groupBy(promoMatches.promoId)
    .all();
  const map: Record<string, number> = {};
  for (const r of rows) map[r.promoId] = Number(r.n);
  return map;
}

// Durable model → collection lookup from the model catalog (survives the
// weekly promo reset). Used for input-time collection suggestion.
export async function getModelCollectionMap(): Promise<Record<string, string>> {
  return getCatalogMap();
}

export async function getBannedCustomers() {
  const rows = db.select({
    banned: bannedCustomers,
    clientId: clients.id,
  }).from(bannedCustomers)
    .leftJoin(clients, eq(bannedCustomers.customerId, clients.id))
    .orderBy(desc(bannedCustomers.banDate)).limit(LIST_QUERY_LIMIT).all();
  return rows;
}

export async function getUnsubscribeList() {
  const rows = db.select({
    unsub: unsubscribeList,
    clientId: clients.id,
    firstName: clients.firstName,
    lastName: clients.lastName,
    customerId: clients.customerId,
  }).from(unsubscribeList)
    .leftJoin(clients, eq(unsubscribeList.email, clients.email))
    .orderBy(desc(unsubscribeList.unsubscribedAt)).limit(LIST_QUERY_LIMIT).all();
  return rows;
}

export async function getEmployees() {
  // Order by manual sortOrder (set via the Employees settings tab), then
  // firstName for ties. Each row carries an `activeClientCount` so the UI
  // can preview impact when deactivating without a second round trip.
  // Soft-deleted employees (deletedAt IS NOT NULL) are hidden from listings
  // but kept in the table for audit-trail FK integrity.
  return db.select({
    id: employees.id,
    firstName: employees.firstName,
    lastName: employees.lastName,
    username: employees.username,
    role: employees.role,
    active: employees.active,
    sortOrder: employees.sortOrder,
    createdAt: employees.createdAt,
    activeClientCount: rawSql<number>`(
      SELECT count(*) FROM clients
      WHERE clients.employee_id = ${employees.id}
        AND clients.status NOT IN ('deleted', 'banned')
    )`.as("active_client_count"),
  })
    .from(employees)
    .where(isNull(employees.deletedAt))
    .orderBy(employees.sortOrder, employees.firstName)
    .all();
}

export async function getEmployee(id: string) {
  return db.select({
    id: employees.id,
    firstName: employees.firstName,
    lastName: employees.lastName,
    username: employees.username,
    role: employees.role,
    active: employees.active,
    sortOrder: employees.sortOrder,
    createdAt: employees.createdAt,
    activeClientCount: rawSql<number>`(
      SELECT count(*) FROM clients
      WHERE clients.employee_id = ${employees.id}
        AND clients.status NOT IN ('deleted', 'banned')
    )`.as("active_client_count"),
  })
    .from(employees)
    .where(and(eq(employees.id, id), isNull(employees.deletedAt)))
    .get();
}

export type SafeEmployeeRow = Awaited<ReturnType<typeof getEmployees>>[number];

export async function getTags() {
  return db.select().from(clientTags).orderBy(desc(clientTags.usageCount)).all();
}

export async function getTemplates() {
  return db.select().from(outreachTemplates).orderBy(outreachTemplates.name).all();
}

export async function getSmartLists(employeeId?: string) {
  const filter = employeeId ? or(eq(smartLists.ownerId, employeeId), eq(smartLists.isShared, true)) : undefined;
  return db.select().from(smartLists).where(filter).orderBy(smartLists.name).all();
}

const BUILTIN_FILTER_TYPES = ["hot", "stale", "recent_purchases", "no_outreach_60", "birthdays_month", "email_subscribers"] as const;
export type BuiltInFilter = typeof BUILTIN_FILTER_TYPES[number];
export const BUILTIN_FILTER_IDS = BUILTIN_FILTER_TYPES;

function buildBuiltInConds(filter: BuiltInFilter, nowSec: number, employeeId?: string): (SQL<unknown> | undefined)[] {
  const base: (SQL<unknown> | undefined)[] = [
    notInArray(clients.status, ["banned", "deleted"]),
    employeeId ? eq(clients.employeeId, employeeId) : undefined,
  ];
  switch (filter) {
    case "hot":
      return [...base, eq(clients.heatLevel, "hot"), eq(clients.status, "active")];
    case "stale":
      return [...base, eq(clients.status, "active"), or(
        and(isNull(clients.lastOutreachAt), isNull(clients.lastPurchaseAt)),
        rawSql`MAX(COALESCE(${clients.lastOutreachAt}, 0), COALESCE(${clients.lastPurchaseAt}, 0)) < ${nowSec - 90 * SEC_PER_DAY}`,
      )];
    case "recent_purchases":
      return [...base, rawSql`${clients.lastPurchaseAt} > ${nowSec - 30 * SEC_PER_DAY}`];
    case "no_outreach_60":
      return [...base, eq(clients.status, "active"), or(isNull(clients.lastOutreachAt), rawSql`${clients.lastOutreachAt} < ${nowSec - 60 * SEC_PER_DAY}`)];
    case "birthdays_month": {
      const m = String(new Date().getMonth() + 1).padStart(2, "0");
      return [...base, isNotNull(clients.birthday), rawSql`substr(${clients.birthday}, 6, 2) = ${m}`];
    }
    case "email_subscribers":
      return [...base, eq(clients.onEmailList, true), rawSql`${clients.status} != 'unsubscribed'`];
  }
}

function buildCustomConds(filters: Record<string, unknown>, nowSec: number, employeeId?: string): (SQL<unknown> | undefined)[] {
  // Translate the smart-list filter blob into the shared ClientFilterParams
  // shape (handles legacy heatLevel/tag keys + new heat/tags/tagMode/dates).
  const clientFilters = smartListToClientFilters(filters);
  const { conds: filterConds } = buildClientFilterConds(clientFilters);

  const conds: (SQL<unknown> | undefined)[] = [
    notInArray(clients.status, ["banned", "deleted"]),
    employeeId ? eq(clients.employeeId, employeeId) : undefined,
    ...filterConds,
  ];

  // Smart-list-only filters (no Clients-page UI equivalent yet)
  if (filters.source) conds.push(rawSql`${clients.source} = ${String(filters.source)}`);
  if (filters.onEmailList) conds.push(eq(clients.onEmailList, true));
  if (filters.stale) {
    conds.push(
      eq(clients.status, "active"),
      or(
        and(isNull(clients.lastOutreachAt), isNull(clients.lastPurchaseAt)),
        rawSql`MAX(COALESCE(${clients.lastOutreachAt}, 0), COALESCE(${clients.lastPurchaseAt}, 0)) < ${nowSec - 90 * SEC_PER_DAY}`,
      ),
    );
  }
  if (filters.birthdayMonth) {
    const m = String(filters.birthdayMonth).padStart(2, "0");
    conds.push(isNotNull(clients.birthday), rawSql`substr(${clients.birthday}, 6, 2) = ${m}`);
  }

  return conds;
}

export interface SmartListClientsResult {
  rows: ClientListRow[];
  /** True when the underlying query had more matches than LIST_QUERY_LIMIT and was truncated. */
  truncated: boolean;
}

/**
 * Detects truncation via the LIMIT+1 trick: query one row beyond the cap;
 * if we got that extra row, the real result set was larger. Returns the
 * capped rows so the caller can render them unchanged.
 */
function capRowsWithTruncationFlag(rows: ClientListRow[]): SmartListClientsResult {
  if (rows.length > LIST_QUERY_LIMIT) {
    return { rows: rows.slice(0, LIST_QUERY_LIMIT), truncated: true };
  }
  return { rows, truncated: false };
}

export async function getBuiltInListClients(filter: string, employeeId?: string): Promise<SmartListClientsResult> {
  if (!BUILTIN_FILTER_IDS.includes(filter as BuiltInFilter)) return { rows: [], truncated: false };
  const nowSec = Math.floor(Date.now() / 1000);
  const conds = buildBuiltInConds(filter as BuiltInFilter, nowSec, employeeId);
  const rows = db.select(clientListProjection).from(clients).where(and(...conds)).orderBy(desc(clients.heatScore)).limit(LIST_QUERY_LIMIT + 1).all();
  return capRowsWithTruncationFlag(rows);
}

export async function getCustomListClients(filters: Record<string, unknown>, employeeId?: string): Promise<SmartListClientsResult> {
  const nowSec = Math.floor(Date.now() / 1000);
  const conds = buildCustomConds(filters, nowSec, employeeId);
  // Owner-name filter references employees.firstName/lastName — join when needed
  const clientFilters = smartListToClientFilters(filters);
  const needsEmployeeJoin = !!(clientFilters.owner && clientFilters.owner !== "any" && clientFilters.owner !== "__none__");
  const base = db.select(clientListProjection).from(clients);
  const q = needsEmployeeJoin
    ? base.leftJoin(employees, eq(clients.employeeId, employees.id))
    : base;
  const rows = q.where(and(...conds)).orderBy(desc(clients.heatScore)).limit(LIST_QUERY_LIMIT + 1).all();
  return capRowsWithTruncationFlag(rows);
}

function countCustomFilter(all: ClientListRow[], filters: Record<string, unknown>): number {
  const now = Date.now();
  const staleMs = 90 * MS_PER_DAY;
  let result = all;

  // Smart-list-only filters (no Clients-page equivalent)
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

  // Shared with Clients page (normalized via smartListToClientFilters — reads
  // both legacy heatLevel/tag and new heat/tags/tagMode/date keys).
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
  // f.owner skipped — would require an employees join not present in the projection
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

export async function getAllSmartListCounts(
  lists: Awaited<ReturnType<typeof getSmartLists>>,
  employeeId?: string,
): Promise<{ builtIn: Record<string, number>; custom: Record<string, number> }> {
  const employeeFilter = employeeId ? eq(clients.employeeId, employeeId) : undefined;
  const allClients = db
    .select(clientListProjection)
    .from(clients)
    .where(and(notInArray(clients.status, ["banned", "deleted"]), employeeFilter))
    .all();

  const builtIn: Record<string, number> = {};
  for (const filter of BUILTIN_FILTER_IDS) {
    builtIn[filter] = applyClientFilter(allClients, filter).length;
  }

  const custom: Record<string, number> = {};
  for (const list of lists) {
    custom[list.id] = countCustomFilter(allClients, list.filters as Record<string, unknown>);
  }
  return { builtIn, custom };
}

export async function getRecentOutreach(limit = 20, employeeId?: string) {
  const employeeFilter = employeeId ? eq(outreachLogs.employeeId, employeeId) : undefined;
  const rows = db.select({ log: outreachLogs, client: clients, employee: employees }).from(outreachLogs)
    .leftJoin(clients, eq(outreachLogs.clientId, clients.id))
    .leftJoin(employees, eq(outreachLogs.employeeId, employees.id))
    .where(employeeFilter)
    .orderBy(desc(outreachLogs.date)).limit(limit).all();
  return rows;
}

export interface SearchProspectHit {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
}

export interface SearchSmartListHit {
  id: string;
  name: string;
  isShared: boolean;
}

/**
 * Quick name search across active prospects for the Cmd+K palette.
 * Substring match on first/last/email/phone (prospects rarely have notes
 * or products of interest, so no FTS5 surface — see lib/db/fts-setup.ts).
 */
export async function searchProspects(query: string): Promise<SearchProspectHit[]> {
  const cleaned = query.toLowerCase().replace(/[%_]/g, "");
  if (!cleaned) return [];
  const q = `%${cleaned}%`;
  return db.select({
    id: prospects.id,
    firstName: prospects.firstName,
    lastName: prospects.lastName,
    phone: prospects.phone,
  })
    .from(prospects)
    .where(and(
      eq(prospects.status, "active"),
      or(
        rawSql`lower(${prospects.firstName}) like ${q}`,
        rawSql`lower(COALESCE(${prospects.lastName}, '')) like ${q}`,
        rawSql`lower(COALESCE(${prospects.email}, '')) like ${q}`,
        rawSql`COALESCE(${prospects.phone}, '') like ${q}`,
      ),
    ))
    .limit(5)
    .all();
}

/**
 * Name-substring search for smart lists visible to this employee (owned or
 * shared). Used by the Cmd+K palette to teleport directly into a saved
 * filter view.
 */
export async function searchSmartLists(query: string, employeeId?: string): Promise<SearchSmartListHit[]> {
  const cleaned = query.toLowerCase().replace(/[%_]/g, "");
  if (!cleaned) return [];
  const q = `%${cleaned}%`;
  const visibility = employeeId ? or(eq(smartLists.ownerId, employeeId), eq(smartLists.isShared, true)) : undefined;
  return db.select({
    id: smartLists.id,
    name: smartLists.name,
    isShared: smartLists.isShared,
  })
    .from(smartLists)
    .where(and(visibility, rawSql`lower(${smartLists.name}) like ${q}`))
    .orderBy(smartLists.name)
    .limit(5)
    .all();
}

/**
 * Top N clients by global recency. Powers the "Recently viewed" group in
 * Cmd+K when the input is empty. Respects per-employee scoping so an
 * associate only sees their own clients.
 */
export async function getRecentlyViewedClients(employeeId?: string, limit = 5): Promise<SearchClientHit[]> {
  const employeeFilter = employeeId ? eq(clients.employeeId, employeeId) : undefined;
  return db.select({
    id: clients.id,
    firstName: clients.firstName,
    lastName: clients.lastName,
    phone: clients.phone,
    email: clients.email,
    snippet: rawSql<string | null>`NULL`.as("snippet"),
  })
    .from(clients)
    .where(and(
      notInArray(clients.status, ["banned", "deleted"]),
      isNotNull(clients.lastViewedAt),
      employeeFilter,
    ))
    .orderBy(desc(clients.lastViewedAt))
    .limit(limit)
    .all();
}

export interface SearchClientHit {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  /** FTS5 snippet text with [[hl]]…[[/hl]] markers around matched tokens. null on phonetic fallback (no MATCH ran). */
  snippet: string | null;
}

export interface SearchClientsResult {
  /** Direct FTS5 matches, or soundex matches when FTS returned nothing. */
  clients: SearchClientHit[];
  /** True when results came from the soundex fallback — the UI can show a "Did you mean?" hint. */
  isPhoneticFallback: boolean;
}

/** Sentinel markers wrapping highlighted match tokens in FTS5 snippets. The renderer parses these. */
const HL_OPEN = "[[hl]]";
const HL_CLOSE = "[[/hl]]";

export async function searchClients(query: string, employeeId?: string): Promise<SearchClientsResult> {
  // FTS5-backed search: spans name, email, phone, notes, products, and
  // promo collection/model. Results are ranked by BM25 (lower = better
  // match), with global recency (clients.lastViewedAt) as a secondary
  // tiebreaker so recently-touched clients surface first when match
  // quality is equal. snippet() picks the best-matching column per row
  // and wraps the matched tokens in sentinel markers the UI parses.
  const fts = toFtsQuery(query);
  if (!fts) return { clients: [], isPhoneticFallback: false };
  const employeeFilter = employeeId ? eq(clients.employeeId, employeeId) : undefined;

  const direct = db.select({
    id: clients.id,
    firstName: clients.firstName,
    lastName: clients.lastName,
    phone: clients.phone,
    email: clients.email,
    snippet: rawSql<string>`(SELECT snippet(clients_fts, -1, ${HL_OPEN}, ${HL_CLOSE}, '…', 10) FROM clients_fts WHERE client_id = ${clients.id} AND clients_fts MATCH ${fts})`.as("snippet"),
  })
    .from(clients)
    .where(and(
      notInArray(clients.status, ["banned", "deleted"]),
      rawSql`${clients.id} IN (SELECT client_id FROM clients_fts WHERE clients_fts MATCH ${fts})`,
      employeeFilter,
    ))
    .orderBy(
      rawSql`(SELECT rank FROM clients_fts WHERE client_id = ${clients.id} AND clients_fts MATCH ${fts})`,
      desc(rawSql`COALESCE(${clients.lastViewedAt}, 0)`),
    )
    .limit(10)
    .all();

  if (direct.length > 0) return { clients: direct, isPhoneticFallback: false };

  // Phonetic fallback — only fires when the query looks like a single
  // alphabetic name token (skips emails, phones, model numbers). Uses
  // SQLite's built-in soundex() against firstName and lastName.
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length !== 1) return { clients: [], isPhoneticFallback: false };
  const token = tokens[0];
  if (token.length < 2 || !/^[a-zA-Z]+$/.test(token)) {
    return { clients: [], isPhoneticFallback: false };
  }

  const phonetic = db.select({
    id: clients.id,
    firstName: clients.firstName,
    lastName: clients.lastName,
    phone: clients.phone,
    email: clients.email,
    snippet: rawSql<string | null>`NULL`.as("snippet"),
  })
    .from(clients)
    .where(and(
      notInArray(clients.status, ["banned", "deleted"]),
      or(
        rawSql`soundex(${clients.firstName}) = soundex(${token})`,
        rawSql`soundex(COALESCE(${clients.lastName}, '')) = soundex(${token})`,
      ),
      employeeFilter,
    ))
    .orderBy(desc(rawSql`COALESCE(${clients.lastViewedAt}, 0)`))
    .limit(5)
    .all();

  return { clients: phonetic, isPhoneticFallback: true };
}

export async function getDeletedClients(employeeId?: string) {
  const employeeFilter = employeeId ? eq(clients.employeeId, employeeId) : undefined;
  return db.select().from(clients).where(and(eq(clients.status, "deleted"), employeeFilter)).orderBy(desc(clients.deletedAt)).limit(LIST_QUERY_LIMIT).all();
}

export async function getRecentActivity(limit = 30, employeeId?: string) {
  const employeeFilter = employeeId ? eq(activityEvents.employeeId, employeeId) : undefined;
  const rows = db.select({
    event: activityEvents,
    employeeName: rawSql<string>`COALESCE(${employees.firstName}, '') || ' ' || COALESCE(${employees.lastName}, '')`,
    clientName: rawSql<string>`COALESCE(${clients.firstName}, '') || ' ' || COALESCE(${clients.lastName}, '')`,
    clientId: clients.id,
  }).from(activityEvents)
    .leftJoin(employees, eq(activityEvents.employeeId, employees.id))
    .leftJoin(clients, eq(activityEvents.clientId, clients.id))
    .where(employeeFilter)
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit)
    .all();
  return rows;
}

export { applyClientFilter };

// ─── Prospects ────────────────────────────────────────────────────────────────

export async function getProspects(status: "active" | "graduated" | "unsubscribed" | "rejected" = "active") {
  return db
    .select({
      id: prospects.id,
      rvxCustomerId: prospects.rvxCustomerId,
      rvxStoreId: prospects.rvxStoreId,
      rvxSpend: prospects.rvxSpend,
      firstName: prospects.firstName,
      lastName: prospects.lastName,
      phone: prospects.phone,
      email: prospects.email,
      status: prospects.status,
      productsOfInterest: prospects.productsOfInterest,
      notes: prospects.notes,
      birthday: prospects.birthday,
      anniversary: prospects.anniversary,
      importBatchId: prospects.importBatchId,
      createdAt: prospects.createdAt,
    })
    .from(prospects)
    .where(eq(prospects.status, status))
    .orderBy(desc(prospects.createdAt))
    .all();
}

export type ProspectListRow = Awaited<ReturnType<typeof getProspects>>[number];

export async function getProspect(id: string) {
  return db.select().from(prospects).where(eq(prospects.id, id)).get();
}

export async function getProspectWithBatch(id: string) {
  return db
    .select({
      prospect: prospects,
      batchStart: rvxImportBatches.reportStartDate,
      batchEnd: rvxImportBatches.reportEndDate,
      importedBy: rvxImportBatches.importedBy,
    })
    .from(prospects)
    .leftJoin(rvxImportBatches, eq(prospects.importBatchId, rvxImportBatches.id))
    .where(eq(prospects.id, id))
    .get();
}

