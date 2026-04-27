import { db } from "@/lib/db";
import { clients, outreachLogs, activityEvents, promoWatches, promoMatches, bannedCustomers, unsubscribeList, employees, clientTags, outreachTemplates, smartLists } from "@/lib/db/schema";
import { eq, desc, and, or, isNotNull, lte, gte, ne, sql as rawSql } from "drizzle-orm";
import { applyClientFilter } from "@/lib/utils";
export async function getAllClients() {
  return db.select().from(clients).where(ne(clients.status, "banned")).orderBy(desc(clients.heatScore)).all();
}

export async function getClient(id: string) {
  return db.select().from(clients).where(eq(clients.id, id)).get();
}

export async function getClientsWithEmployee() {
  const rows = db.select({
    client: clients,
    employeeName: employees.name,
  }).from(clients).leftJoin(employees, eq(clients.employeeId, employees.id)).where(ne(clients.status, "banned")).orderBy(desc(clients.heatScore)).all();
  return rows;
}

export async function getClientOutreach(clientId: string) {
  return db.select().from(outreachLogs).where(eq(outreachLogs.clientId, clientId)).orderBy(desc(outreachLogs.date)).all();
}

export async function getClientActivity(clientId: string) {
  return db.select().from(activityEvents).where(eq(activityEvents.clientId, clientId)).orderBy(desc(activityEvents.createdAt)).all();
}

export async function getUpcomingFollowUps() {
  const now = Date.now();
  const in7d = now + 7 * 86400000;
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
    ))
    .orderBy(outreachLogs.followUpDate)
    .all();
  return rows;
}

export async function getOverdueFollowUps() {
  const now = new Date();
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
    ))
    .orderBy(outreachLogs.followUpDate)
    .all();
  return rows;
}

export async function getStats() {
  const total = db.select({ c: rawSql<number>`count(*)` }).from(clients).get();
  const active = db.select({ c: rawSql<number>`count(*)` }).from(clients).where(eq(clients.status, "active")).get();
  const hot = db.select({ c: rawSql<number>`count(*)` }).from(clients).where(and(eq(clients.heatLevel, "hot"), eq(clients.status, "active"))).get();
  const warm = db.select({ c: rawSql<number>`count(*)` }).from(clients).where(and(eq(clients.heatLevel, "warm"), eq(clients.status, "active"))).get();
  const cold = db.select({ c: rawSql<number>`count(*)` }).from(clients).where(and(eq(clients.heatLevel, "cold"), eq(clients.status, "active"))).get();
  const banned = db.select({ c: rawSql<number>`count(*)` }).from(bannedCustomers).get();
  const unsubscribed = db.select({ c: rawSql<number>`count(*)` }).from(unsubscribeList).get();
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const outreachWeek = db.select({ c: rawSql<number>`count(*)` }).from(outreachLogs).where(gte(outreachLogs.date, weekAgo)).get();
  const purchasesWeek = db.select({ c: rawSql<number>`count(*)` }).from(outreachLogs).where(and(eq(outreachLogs.outcome, "purchased"), gte(outreachLogs.date, weekAgo))).get();
  return {
    total: total?.c ?? 0,
    active: active?.c ?? 0,
    hot: hot?.c ?? 0,
    warm: warm?.c ?? 0,
    cold: cold?.c ?? 0,
    banned: banned?.c ?? 0,
    unsubscribed: unsubscribed?.c ?? 0,
    outreachWeek: outreachWeek?.c ?? 0,
    purchasesWeek: purchasesWeek?.c ?? 0,
  };
}

export async function getPromos() {
  return db.select().from(promoWatches).orderBy(desc(promoWatches.dateAdded)).all();
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
    .orderBy(desc(bannedCustomers.banDate)).all();
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
    .orderBy(desc(unsubscribeList.unsubscribedAt)).all();
  return rows;
}

export async function getEmployees() {
  return db.select().from(employees).orderBy(employees.name).all();
}

export async function getTags() {
  return db.select().from(clientTags).orderBy(desc(clientTags.usageCount)).all();
}

export async function getTemplates() {
  return db.select().from(outreachTemplates).orderBy(outreachTemplates.name).all();
}

export async function getSmartLists() {
  return db.select().from(smartLists).orderBy(smartLists.name).all();
}

export async function getRecentOutreach(limit = 20) {
  const rows = db.select({ log: outreachLogs, client: clients, employee: employees }).from(outreachLogs)
    .leftJoin(clients, eq(outreachLogs.clientId, clients.id))
    .leftJoin(employees, eq(outreachLogs.employeeId, employees.id))
    .orderBy(desc(outreachLogs.date)).limit(limit).all();
  return rows;
}

export async function searchClients(query: string) {
  const q = `%${query.toLowerCase()}%`;
  return db.select().from(clients).where(and(
    ne(clients.status, "banned"),
    or(
      rawSql`lower(${clients.firstName}) like ${q}`,
      rawSql`lower(${clients.lastName}) like ${q}`,
      rawSql`lower(${clients.email}) like ${q}`,
      rawSql`${clients.phone} like ${q}`,
    )
  )).limit(10).all();
}

export { applyClientFilter };
