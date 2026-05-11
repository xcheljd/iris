import { db } from "@/lib/db";
import { clients, outreachLogs, activityEvents, promoWatches, bannedCustomers, unsubscribeList, employees, clientTags, outreachTemplates, smartLists, rvxImportBatches, prospects } from "@/lib/db/schema";
import { eq, desc, asc, and, or, isNull, isNotNull, lte, gte, notInArray, sql as rawSql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { applyClientFilter } from "@/lib/utils";
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
    heat?: string;
    owner?: string;
    filter?: string;
    sort?: ClientSortKey;
    sortDir?: "asc" | "desc";
    page?: number;
    pageSize?: number;
  },
) {
  const { q, heat, owner, filter, sort = "heat", sortDir = "desc", page = 1, pageSize = DEFAULT_PAGE_SIZE } = opts;
  const nowSec = Math.floor(Date.now() / 1000);

  const conds: (SQL<unknown> | undefined)[] = [
    notInArray(clients.status, ["banned", "deleted"]),
    employeeId ? eq(clients.employeeId, employeeId) : undefined,
  ];

  if (q) {
    const ql = `%${q.toLowerCase()}%`;
    conds.push(or(
      rawSql`lower(${clients.firstName} || ' ' || COALESCE(${clients.lastName}, '')) LIKE ${ql}`,
      rawSql`lower(COALESCE(${clients.email}, '')) LIKE ${ql}`,
      rawSql`COALESCE(${clients.phone}, '') LIKE ${ql}`,
    ));
  }

  if (heat && heat !== "any") conds.push(eq(clients.heatLevel, heat as "hot" | "warm" | "cold"));

  if (owner && owner !== "any") {
    if (owner === "__none__") {
      conds.push(isNull(clients.employeeId));
    } else {
      conds.push(rawSql`TRIM(COALESCE(${employees.firstName}, '') || ' ' || COALESCE(${employees.lastName}, '')) = ${owner}`);
    }
  }

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
  return db.select({
    id: employees.id,
    firstName: employees.firstName,
    lastName: employees.lastName,
    username: employees.username,
    role: employees.role,
    active: employees.active,
    createdAt: employees.createdAt,
  }).from(employees).orderBy(employees.firstName).all();
}

export async function getEmployee(id: string) {
  return db.select({
    id: employees.id,
    firstName: employees.firstName,
    lastName: employees.lastName,
    username: employees.username,
    role: employees.role,
    active: employees.active,
    createdAt: employees.createdAt,
  }).from(employees).where(eq(employees.id, id)).get();
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
  const conds: (SQL<unknown> | undefined)[] = [
    notInArray(clients.status, ["banned", "deleted"]),
    employeeId ? eq(clients.employeeId, employeeId) : undefined,
  ];
  if (filters.heatLevel) conds.push(eq(clients.heatLevel, filters.heatLevel as "hot" | "warm" | "cold"));
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
  const tagValues = filters.tags
    ? (Array.isArray(filters.tags) ? filters.tags : [filters.tags])
    : filters.tag ? [filters.tag] : [];
  for (const tag of tagValues) {
    conds.push(rawSql`EXISTS (SELECT 1 FROM json_each(${clients.tags}) WHERE value = ${String(tag)})`);
  }
  return conds;
}

export async function getBuiltInListClients(filter: string, employeeId?: string): Promise<ClientListRow[]> {
  if (!BUILTIN_FILTER_IDS.includes(filter as BuiltInFilter)) return [];
  const nowSec = Math.floor(Date.now() / 1000);
  const conds = buildBuiltInConds(filter as BuiltInFilter, nowSec, employeeId);
  return db.select(clientListProjection).from(clients).where(and(...conds)).orderBy(desc(clients.heatScore)).limit(1000).all();
}

export async function getCustomListClients(filters: Record<string, unknown>, employeeId?: string): Promise<ClientListRow[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const conds = buildCustomConds(filters, nowSec, employeeId);
  return db.select(clientListProjection).from(clients).where(and(...conds)).orderBy(desc(clients.heatScore)).limit(1000).all();
}

function countCustomFilter(all: ClientListRow[], filters: Record<string, unknown>): number {
  const now = Date.now();
  const staleMs = 90 * MS_PER_DAY;
  let result = all;
  if (filters.heatLevel) result = result.filter((c) => c.heatLevel === String(filters.heatLevel));
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
  const tagValues = filters.tags
    ? (Array.isArray(filters.tags) ? filters.tags : [filters.tags])
    : filters.tag ? [filters.tag] : [];
  for (const tag of tagValues) {
    result = result.filter((c) => Array.isArray(c.tags) && (c.tags as string[]).includes(String(tag)));
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

export async function searchClients(query: string, employeeId?: string) {
  const cleaned = query.toLowerCase().replace(/[%_]/g, "");
  if (!cleaned) return [];
  const q = `%${cleaned}%`;
  const employeeFilter = employeeId ? eq(clients.employeeId, employeeId) : undefined;
  return db.select().from(clients).where(and(
    notInArray(clients.status, ["banned", "deleted"]),
    or(
      rawSql`lower(${clients.firstName}) like ${q}`,
      rawSql`lower(${clients.lastName}) like ${q}`,
      rawSql`lower(${clients.email}) like ${q}`,
      rawSql`${clients.phone} like ${q}`,
    ),
    employeeFilter
  )).limit(10).all();
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

