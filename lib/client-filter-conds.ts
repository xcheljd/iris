/**
 * Shared client-filter condition builder.
 *
 * Both the Clients listing query (lib/queries.ts) and the Email Recipients
 * server action (lib/actions/email-recipients.ts) accept the same set of
 * user-driven filters from the Clients page. This module is the single source
 * of truth for translating those filters into Drizzle SQL conditions, so the
 * two paths stay in lockstep when new filters are added. The CSV export and
 * custom smart lists build from here too, and so does the `?filter=` quick
 * filter, so every "what's on screen" scope matches the listing.
 *
 * Note: callers layer in their own *base* conds (status restrictions,
 * onEmailList=true for email export, employeeId scoping, etc.). This helper
 * only emits the user-driven filter conds plus a hint about whether the
 * Owner filter needs an `employees` join.
 */

import { and, eq, isNull, or, sql as rawSql, gte, lte, type SQL } from "drizzle-orm";
import { clients, employees } from "@/lib/db/schema";
import { toFtsQuery } from "@/lib/fts";
import { containsLikeLower, containsPhone } from "@/lib/like";
import { SEC_PER_DAY } from "@/lib/constants";

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
  /** Built-in quick filter from `?filter=` (a BuiltInFilter id; unknown ids are ignored). */
  filter?: string;
}

export interface BuiltClientFilterConds {
  conds: SQL<unknown>[];
  /** True if any cond references `employees` columns — the caller must join. */
  needsEmployeeJoin: boolean;
}

export function buildClientFilterConds(filters: ClientFilterParams): BuiltClientFilterConds {
  const {
    q, nameQ, contactQ, heat, owner, tags, tagMode = "any",
    lastContactFrom, lastContactTo, createdFrom, createdTo, filter,
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
    conds.push(containsLikeLower(rawSql`${clients.firstName} || ' ' || COALESCE(${clients.lastName}, '')`, nameQ.toLowerCase()));
  }

  if (contactQ) {
    const cq = contactQ.toLowerCase();
    const orCond = or(
      containsLikeLower(rawSql`COALESCE(${clients.email}, '')`, cq),
      containsPhone(rawSql`COALESCE(${clients.phone}, '')`, cq),
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

  if (filter) conds.push(...quickFilterConds(filter));

  return { conds, needsEmployeeJoin };
}

function quickFilterConds(filter: string): SQL<unknown>[] {
  const nowSec = Math.floor(Date.now() / 1000);
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  switch (filter) {
    case "hot":
      return [eq(clients.heatLevel, "hot"), eq(clients.status, "active")];
    case "stale":
      return [
        eq(clients.status, "active"),
        or(
          and(isNull(clients.lastOutreachAt), isNull(clients.lastPurchaseAt)),
          rawSql`MAX(COALESCE(${clients.lastOutreachAt}, 0), COALESCE(${clients.lastPurchaseAt}, 0)) < ${nowSec - 90 * SEC_PER_DAY}`,
        )!,
      ];
    case "recent_purchases":
      return [rawSql`${clients.lastPurchaseAt} > ${nowSec - 30 * SEC_PER_DAY}`];
    case "no_outreach_60":
      return [
        eq(clients.status, "active"),
        or(isNull(clients.lastOutreachAt), rawSql`${clients.lastOutreachAt} < ${nowSec - 60 * SEC_PER_DAY}`)!,
      ];
    case "birthdays_month":
      return [rawSql`substr(${clients.birthday}, 6, 2) = ${month}`];
    case "anniversaries_month":
      return [rawSql`substr(${clients.anniversary}, 6, 2) = ${month}`];
    case "email_subscribers":
      return [eq(clients.onEmailList, true), rawSql`${clients.status} != 'unsubscribed'`];
    default:
      return [];
  }
}
