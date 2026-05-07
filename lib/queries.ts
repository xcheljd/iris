import { db } from "@/lib/db";
import { clients, outreachLogs, activityEvents, promoWatches, promoMatches, bannedCustomers, unsubscribeList, employees, clientTags, outreachTemplates, smartLists } from "@/lib/db/schema";
import { eq, desc, and, or, isNotNull, lte, gte, notInArray, sql as rawSql } from "drizzle-orm";
import { applyClientFilter } from "@/lib/utils";
import { MS_PER_DAY } from "@/lib/constants";

const LIST_QUERY_LIMIT = 10000;

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

export async function getUpcomingFollowUps(employeeId?: string) {
  const now = Date.now();
  const in7d = now + 7 * MS_PER_DAY;
  const employeeFilter = employeeId ? eq(outreachLogs.employeeId, employeeId) : undefined;
  const rows = db.select({
    log: outreachLogs,
    client: clients,
    employee: employees,
  }).from(outreachLogs)
    .leftJoin(clients, eq(outreachLogs.clientId, clients.id))
    .leftJoin(employees, eq(outreachLogs.employeeId, employees.id))
    .where(and(
      isNotNull(outreachLogs.followUpDate),
      eq(outreachLogs.completed, false),
      lte(outreachLogs.followUpDate, new Date(in7d)),
      employeeFilter,
    ))
    .orderBy(outreachLogs.followUpDate)
    .all();
  return rows;
}

export async function getOverdueFollowUps(employeeId?: string) {
  const now = new Date();
  const employeeFilter = employeeId ? eq(outreachLogs.employeeId, employeeId) : undefined;
  const rows = db.select({
    log: outreachLogs,
    client: clients,
    employee: employees,
  }).from(outreachLogs)
    .leftJoin(clients, eq(outreachLogs.clientId, clients.id))
    .leftJoin(employees, eq(outreachLogs.employeeId, employees.id))
    .where(and(
      isNotNull(outreachLogs.followUpDate),
      eq(outreachLogs.completed, false),
      lte(outreachLogs.followUpDate, now),
      employeeFilter,
    ))
    .orderBy(outreachLogs.followUpDate)
    .all();
  return rows;
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

  const weekAgo = new Date(Date.now() - 7 * MS_PER_DAY);
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

export async function getPromoMatchesForPromo(promoId: string) {
  const rows = db.select({ match: promoMatches, client: clients }).from(promoMatches)
    .leftJoin(clients, eq(promoMatches.clientId, clients.id))
    .where(eq(promoMatches.promoId, promoId)).all();
  return rows;
}

export async function getPromoMatchesForClient(clientId: string) {
  const rows = db.select({ match: promoMatches, promo: promoWatches }).from(promoMatches)
    .leftJoin(promoWatches, eq(promoMatches.promoId, promoWatches.id))
    .where(eq(promoMatches.clientId, clientId)).all();
  return rows;
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
