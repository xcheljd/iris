/**
 * Shared client-filter condition builder.
 *
 * Both the Clients listing query (lib/queries.ts) and the Email Recipients
 * server action (lib/actions/email-recipients.ts) accept the same set of
 * user-driven filters from the Clients page. This module is the single source
 * of truth for translating those filters into Drizzle SQL conditions, so the
 * two paths stay in lockstep when new filters are added.
 *
 * Note: callers layer in their own *base* conds (status restrictions,
 * onEmailList=true for email export, employeeId scoping, etc.). This helper
 * only emits the user-driven filter conds plus a hint about whether the
 * Owner filter needs an `employees` join.
 */

import { eq, isNull, or, sql as rawSql, gte, lte, type SQL } from "drizzle-orm";
import { clients, employees } from "@/lib/db/schema";
import { toFtsQuery } from "@/lib/fts";

export interface ClientFilterParams {
  /** Global free-text search (matches name OR email OR phone). */
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

export interface BuiltClientFilterConds {
  conds: SQL<unknown>[];
  /** True if any cond references `employees` columns — the caller must join. */
  needsEmployeeJoin: boolean;
}

export function buildClientFilterConds(filters: ClientFilterParams): BuiltClientFilterConds {
  const {
    q, nameQ, contactQ, heat, owner, tags, tagMode = "any",
    lastContactFrom, lastContactTo, createdFrom, createdTo,
  } = filters;

  const conds: SQL<unknown>[] = [];

  if (q) {
    // Global search uses the FTS5 index which spans name + email + phone +
    // notes + productsOfInterest, so model numbers and free-text product
    // mentions are matchable. Falls back to no-op when the cleaned query is
    // empty (e.g. user typed only whitespace).
    const fts = toFtsQuery(q);
    if (fts) {
      conds.push(rawSql`${clients.id} IN (SELECT client_id FROM clients_fts WHERE clients_fts MATCH ${fts})`);
    }
  }

  if (nameQ) {
    const nq = `%${nameQ.toLowerCase()}%`;
    conds.push(rawSql`lower(${clients.firstName} || ' ' || COALESCE(${clients.lastName}, '')) LIKE ${nq}`);
  }

  if (contactQ) {
    const cq = `%${contactQ.toLowerCase()}%`;
    const orCond = or(
      rawSql`lower(COALESCE(${clients.email}, '')) LIKE ${cq}`,
      rawSql`COALESCE(${clients.phone}, '') LIKE ${cq}`,
    );
    if (orCond) conds.push(orCond);
  }

  if (heat && heat !== "any") {
    conds.push(eq(clients.heatLevel, heat as "hot" | "warm" | "cold"));
  }

  let needsEmployeeJoin = false;
  if (owner && owner !== "any") {
    if (owner === "__none__") {
      conds.push(isNull(clients.employeeId));
    } else {
      conds.push(rawSql`TRIM(COALESCE(${employees.firstName}, '') || ' ' || COALESCE(${employees.lastName}, '')) = ${owner}`);
      needsEmployeeJoin = true;
    }
  }

  if (tags && tags.length > 0) {
    if (tagMode === "all") {
      for (const tag of tags) {
        conds.push(rawSql`EXISTS (SELECT 1 FROM json_each(${clients.tags}) WHERE json_each.value = ${tag})`);
      }
    } else {
      const placeholders = tags.map((t) => rawSql`${t}`);
      conds.push(rawSql`EXISTS (SELECT 1 FROM json_each(${clients.tags}) WHERE json_each.value IN (${rawSql.join(placeholders, rawSql`, `)}))`);
    }
  }

  if (lastContactFrom !== undefined) conds.push(gte(clients.lastOutreachAt, new Date(lastContactFrom * 1000)));
  if (lastContactTo !== undefined) conds.push(lte(clients.lastOutreachAt, new Date(lastContactTo * 1000)));
  if (createdFrom !== undefined) conds.push(gte(clients.createdAt, new Date(createdFrom * 1000)));
  if (createdTo !== undefined) conds.push(lte(clients.createdAt, new Date(createdTo * 1000)));

  return { conds, needsEmployeeJoin };
}
