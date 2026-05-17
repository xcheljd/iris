"use server";

import { db } from "@/lib/db";
import { clients, employees } from "@/lib/db/schema";
import { and, eq, notInArray, type SQL } from "drizzle-orm";
import { sql as rawSql } from "drizzle-orm";
import { buildClientFilterConds, type ClientFilterParams } from "@/lib/client-filter-conds";
import { LIST_QUERY_LIMIT } from "@/lib/constants";
import { requireAuth } from "./_shared";
import { toCsv } from "@/lib/csv";

export interface ClientsCsvExportResult {
  csv: string;
  rowCount: number;
  /** True when the underlying query had more matches than LIST_QUERY_LIMIT. */
  truncated: boolean;
}

/**
 * Builds a CSV export of clients matching the current Clients-page filters.
 * Reuses buildClientFilterConds so the export tracks the listing 1:1.
 * Includes a header row and one row per client. Output uses the shared
 * `toCsv`/`csvCell`: RFC-4180 quoting plus spreadsheet formula-injection
 * neutralization (cells starting `= + - @` are quote-prefixed).
 *
 * Scoping mirrors the Clients page: associates see only their own clients;
 * managers see everyone. Excludes banned and deleted clients.
 */
export async function exportClientsCsv(filters: ClientFilterParams = {}): Promise<ClientsCsvExportResult> {
  const user = await requireAuth();
  const employeeId = user.role === "manager" ? undefined : user.id;

  const { conds: filterConds, needsEmployeeJoin } = buildClientFilterConds(filters);
  const conds: (SQL<unknown> | undefined)[] = [
    notInArray(clients.status, ["banned", "deleted"]),
    employeeId ? eq(clients.employeeId, employeeId) : undefined,
    ...filterConds,
  ];

  // Always join employees so we can emit the owner's display name, regardless
  // of whether the filter needs it. needsEmployeeJoin is preserved for symmetry
  // with the listing query but not strictly required here.
  void needsEmployeeJoin;

  const rows = db
    .select({
      firstName: clients.firstName,
      lastName: clients.lastName,
      email: clients.email,
      phone: clients.phone,
      status: clients.status,
      heatLevel: clients.heatLevel,
      heatScore: clients.heatScore,
      ownerName: rawSql<string | null>`NULLIF(TRIM(COALESCE(${employees.firstName}, '') || ' ' || COALESCE(${employees.lastName}, '')), '')`.as("owner_name"),
      tags: clients.tags,
      onEmailList: clients.onEmailList,
      source: clients.source,
      birthday: clients.birthday,
      anniversary: clients.anniversary,
      lastOutreachAt: clients.lastOutreachAt,
      lastPurchaseAt: clients.lastPurchaseAt,
      createdAt: clients.createdAt,
      notes: clients.notes,
    })
    .from(clients)
    .leftJoin(employees, eq(clients.employeeId, employees.id))
    .where(and(...conds))
    .orderBy(clients.firstName, clients.lastName)
    .limit(LIST_QUERY_LIMIT + 1)
    .all();

  const truncated = rows.length > LIST_QUERY_LIMIT;
  const capped = truncated ? rows.slice(0, LIST_QUERY_LIMIT) : rows;

  const header = [
    "First Name", "Last Name", "Email", "Phone",
    "Status", "Heat Level", "Heat Score",
    "Owner", "Tags", "On Email List", "Source",
    "Birthday", "Anniversary",
    "Last Contact", "Last Purchase", "Date Added",
    "Notes",
  ];

  const dataRows = capped.map((r) => [
    r.firstName ?? "",
    r.lastName ?? "",
    r.email ?? "",
    r.phone ?? "",
    r.status,
    r.heatLevel,
    String(r.heatScore),
    r.ownerName ?? "",
    Array.isArray(r.tags) ? r.tags.join("; ") : "",
    r.onEmailList ? "Yes" : "No",
    r.source,
    r.birthday ?? "",
    r.anniversary ?? "",
    r.lastOutreachAt ? toIsoDate(r.lastOutreachAt) : "",
    r.lastPurchaseAt ? toIsoDate(r.lastPurchaseAt) : "",
    r.createdAt ? toIsoDate(r.createdAt) : "",
    r.notes ?? "",
  ]);

  return {
    csv: toCsv(header, dataRows),
    rowCount: capped.length,
    truncated,
  };
}

function toIsoDate(d: Date | number | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}
