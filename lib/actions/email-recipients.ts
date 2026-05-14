"use server";

import { db } from "@/lib/db";
import { clients, prospects, employees } from "@/lib/db/schema";
import { and, eq, gte, isNull, isNotNull, lte, notInArray, or, sql as rawSql, type SQL } from "drizzle-orm";
import { requireAuth } from "./_shared";

export interface ClientEmailFilters {
  q?: string;
  /** Column-scoped: name only. */
  nameQ?: string;
  /** Column-scoped: email or phone only. */
  contactQ?: string;
  heat?: string;
  owner?: string;
  tags?: string[];
  tagMode?: "any" | "all";
  /** Unix seconds bounds for clients.lastOutreachAt. */
  lastContactFrom?: number;
  lastContactTo?: number;
  /** Unix seconds bounds for clients.createdAt. */
  createdFrom?: number;
  createdTo?: number;
}

export interface EmailRecipientsResult {
  clients: { count: number; emails: string[] };
  prospects: { count: number; emails: string[] };
}

/**
 * Returns the comma-separable email lists for clients (filtered) and active
 * prospects (always all eligible). Dedup and union is the caller's job —
 * this action returns the two buckets separately so the dialog can toggle
 * them independently.
 *
 * Scoping mirrors the Clients page: associates see only their own clients,
 * managers see everyone. Prospects are not employee-scoped.
 */
export async function getEmailRecipients(filters: ClientEmailFilters = {}): Promise<EmailRecipientsResult> {
  const user = await requireAuth();
  const employeeId = user.role === "manager" ? undefined : user.id;

  const { q, nameQ, contactQ, heat, owner, tags, tagMode = "any", lastContactFrom, lastContactTo, createdFrom, createdTo } = filters;

  /* ---- clients query ---- */
  const clientConds: (SQL<unknown> | undefined)[] = [
    notInArray(clients.status, ["banned", "deleted", "unsubscribed"]),
    eq(clients.onEmailList, true),
    isNotNull(clients.email),
    employeeId ? eq(clients.employeeId, employeeId) : undefined,
  ];

  if (q) {
    const ql = `%${q.toLowerCase()}%`;
    clientConds.push(or(
      rawSql`lower(${clients.firstName} || ' ' || COALESCE(${clients.lastName}, '')) LIKE ${ql}`,
      rawSql`lower(COALESCE(${clients.email}, '')) LIKE ${ql}`,
      rawSql`COALESCE(${clients.phone}, '') LIKE ${ql}`,
    ));
  }

  if (nameQ) {
    const nq = `%${nameQ.toLowerCase()}%`;
    clientConds.push(rawSql`lower(${clients.firstName} || ' ' || COALESCE(${clients.lastName}, '')) LIKE ${nq}`);
  }

  if (contactQ) {
    const cq = `%${contactQ.toLowerCase()}%`;
    clientConds.push(or(
      rawSql`lower(COALESCE(${clients.email}, '')) LIKE ${cq}`,
      rawSql`COALESCE(${clients.phone}, '') LIKE ${cq}`,
    ));
  }

  if (lastContactFrom !== undefined) clientConds.push(gte(clients.lastOutreachAt, new Date(lastContactFrom * 1000)));
  if (lastContactTo !== undefined) clientConds.push(lte(clients.lastOutreachAt, new Date(lastContactTo * 1000)));
  if (createdFrom !== undefined) clientConds.push(gte(clients.createdAt, new Date(createdFrom * 1000)));
  if (createdTo !== undefined) clientConds.push(lte(clients.createdAt, new Date(createdTo * 1000)));

  if (heat && heat !== "any") {
    clientConds.push(eq(clients.heatLevel, heat as "hot" | "warm" | "cold"));
  }

  if (owner && owner !== "any") {
    if (owner === "__none__") {
      clientConds.push(isNull(clients.employeeId));
    } else {
      clientConds.push(rawSql`TRIM(COALESCE(${employees.firstName}, '') || ' ' || COALESCE(${employees.lastName}, '')) = ${owner}`);
    }
  }

  if (tags && tags.length > 0) {
    if (tagMode === "all") {
      for (const tag of tags) {
        clientConds.push(rawSql`EXISTS (SELECT 1 FROM json_each(${clients.tags}) WHERE json_each.value = ${tag})`);
      }
    } else {
      const placeholders = tags.map((t) => rawSql`${t}`);
      clientConds.push(rawSql`EXISTS (SELECT 1 FROM json_each(${clients.tags}) WHERE json_each.value IN (${rawSql.join(placeholders, rawSql`, `)}))`);
    }
  }

  // Join employees only when needed (owner name filter)
  const needsEmployeeJoin = owner && owner !== "any" && owner !== "__none__";
  const baseClientQuery = db.select({ email: clients.email }).from(clients);
  const clientRows = (needsEmployeeJoin
    ? baseClientQuery.leftJoin(employees, eq(clients.employeeId, employees.id)).where(and(...clientConds)).orderBy(clients.email)
    : baseClientQuery.where(and(...clientConds)).orderBy(clients.email)
  ).all();

  const clientEmails = dedupedSortedEmails(clientRows);

  /* ---- prospects query ---- */
  const prospectRows = db
    .select({ email: prospects.email })
    .from(prospects)
    .where(and(eq(prospects.status, "active"), isNotNull(prospects.email)))
    .orderBy(prospects.email)
    .all();

  const prospectEmails = dedupedSortedEmails(prospectRows);

  return {
    clients: { count: clientEmails.length, emails: clientEmails },
    prospects: { count: prospectEmails.length, emails: prospectEmails },
  };
}

function dedupedSortedEmails(rows: { email: string | null }[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.email) continue;
    const normalized = r.email.trim().toLowerCase();
    if (normalized) seen.add(normalized);
  }
  return Array.from(seen).sort();
}
