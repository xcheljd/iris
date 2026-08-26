"use server";

import { LIST_QUERY_LIMIT } from "@/lib/constants";
import { toCsv } from "@/lib/csv";
import { requireAuth } from "./_shared";
import { getMatchedClients } from "@/lib/queries";

export type MatchedClientsCsvScope =
  | { mode: "all" }
  | { mode: "filter"; owners: string[]; matchTypes: string[]; brands: string[] };

export interface MatchedClientsCsvExportResult {
  csv: string;
  rowCount: number;
  /** True when the matched-row set exceeded LIST_QUERY_LIMIT. */
  truncated: boolean;
}

const HEADER = [
  "Client ID", "First Name", "Last Name", "Assigned Associate",
  "Preferred Contact", "Phone", "Email",
  "Promo Model", "Promo Collection", "Promo Brand",
  "MSRP", "Sale Price", "Match Type",
];

/**
 * CSV of matched clients — one row per (client, promo), 1:1 with the
 * Matched Clients tab. Source is getMatchedClients (same joins,
 * deleted/orphaned exclusion, and manager/associate scoping). The
 * `filter` scope applies the tab's facet predicates (empty array =
 * unconstrained for that facet).
 */
export async function exportMatchedClientsCsv(
  scope: MatchedClientsCsvScope = { mode: "all" },
): Promise<MatchedClientsCsvExportResult> {
  const user = await requireAuth();
  const employeeId = user.role === "manager" ? undefined : user.id;

  // The export is the one caller that wants everything, not the page-render
  // cap getMatchedClients defaults to.
  let rows = await getMatchedClients(employeeId, LIST_QUERY_LIMIT);

  if (scope.mode === "filter") {
    const owners = new Set(scope.owners);
    const types = new Set(scope.matchTypes);
    const brands = new Set(scope.brands);
    rows = rows.filter((r) =>
      (owners.size === 0 || (r.ownerName != null && owners.has(r.ownerName))) &&
      (types.size === 0 || types.has(r.matchType)) &&
      (brands.size === 0 || (r.promoBrand != null && brands.has(r.promoBrand))),
    );
  }

  const truncated = rows.length > LIST_QUERY_LIMIT;
  const capped = truncated ? rows.slice(0, LIST_QUERY_LIMIT) : rows;

  const csv = toCsv(
    HEADER,
    capped.map((r) => [
      r.clientId,
      r.clientFirstName,
      r.clientLastName ?? "",
      r.ownerName ?? "",
      r.preferredContact ?? "",
      r.phone ?? "",
      r.email ?? "",
      r.promoModel,
      r.promoCollection,
      r.promoBrand ?? "",
      r.msrp == null ? "" : r.msrp.toFixed(2),
      r.discountPrice == null ? "" : r.discountPrice.toFixed(2),
      r.matchType,
    ]),
  );

  return { csv, rowCount: capped.length, truncated };
}
