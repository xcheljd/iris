"use server";

import { db } from "@/lib/db";
import { clients, employees, INTEREST_INTENT_VALUES, type InterestIntent } from "@/lib/db/schema";
import { and, eq, notInArray } from "drizzle-orm";
import { sql as rawSql } from "drizzle-orm";
import { LIST_QUERY_LIMIT } from "@/lib/constants";
import { toCsv } from "@/lib/csv";
import { requireAuth } from "./_shared";
import { getCatalogIndex } from "./model-catalog";
import { resolveInterest } from "@/lib/resolve-interest";

export type CollectionsCsvScope =
  | { mode: "all" }
  | { mode: "selected"; collection: string }
  | { mode: "filter"; query: string };

export interface CollectionsCsvExportResult {
  csv: string;
  rowCount: number;
  /** True when the client query had more matches than LIST_QUERY_LIMIT. */
  truncated: boolean;
}

const HEADER = [
  "Collection", "Model", "First Name", "Last Name",
  "Phone", "Email", "Owner", "Intents",
];

/**
 * CSV of collection interest, one row per (client, collection, model).
 * A collection-only interest emits a blank-Model row; model-only entries
 * (no collection) are excluded. Intents are the distinct intents across
 * all of that client's entries for the collection, in canonical order.
 *
 * Scoping mirrors the Clients export: managers see all clients,
 * associates only their own; banned/deleted excluded.
 */
export async function exportCollectionsCsv(
  scope: CollectionsCsvScope = { mode: "all" },
): Promise<CollectionsCsvExportResult> {
  const user = await requireAuth();
  const employeeId = user.role === "manager" ? undefined : user.id;

  const rows = db
    .select({
      firstName: clients.firstName,
      lastName: clients.lastName,
      phone: clients.phone,
      email: clients.email,
      productsOfInterest: clients.productsOfInterest,
      ownerName: rawSql<string | null>`NULLIF(TRIM(COALESCE(${employees.firstName}, '') || ' ' || COALESCE(${employees.lastName}, '')), '')`.as("owner_name"),
    })
    .from(clients)
    .leftJoin(employees, eq(clients.employeeId, employees.id))
    .where(and(
      notInArray(clients.status, ["banned", "deleted"]),
      employeeId ? eq(clients.employeeId, employeeId) : undefined,
    ))
    .orderBy(clients.firstName, clients.lastName)
    .limit(LIST_QUERY_LIMIT + 1)
    .all();

  const truncated = rows.length > LIST_QUERY_LIMIT;
  const capped = truncated ? rows.slice(0, LIST_QUERY_LIMIT) : rows;

  const matchesScope = (collection: string): boolean => {
    if (scope.mode === "selected") return collection === scope.collection;
    if (scope.mode === "filter") {
      return collection.toLowerCase().includes(scope.query.trim().toLowerCase());
    }
    return true;
  };

  const intentRank = (i: string) => INTEREST_INTENT_VALUES.indexOf(i as InterestIntent);

  const catalog = getCatalogIndex();
  const out: string[][] = [];
  for (const r of capped) {
    // Group this client's entries by collection (catalog-resolved: a
    // cataloged model's collection wins over any stored value).
    const byCollection = new Map<string, { models: Set<string>; intents: Set<string> }>();
    for (const p of r.productsOfInterest ?? []) {
      const { collection } = resolveInterest(p, catalog);
      if (!collection) continue; // collection interest only
      let g = byCollection.get(collection);
      if (!g) { g = { models: new Set(), intents: new Set() }; byCollection.set(collection, g); }
      g.models.add(p.model ?? ""); // "" = collection-only row
      if (p.intent) g.intents.add(p.intent);
    }
    for (const [collection, g] of byCollection) {
      if (!matchesScope(collection)) continue;
      const intents = [...g.intents]
        .sort((a, b) => intentRank(a) - intentRank(b))
        .join("; ");
      for (const model of [...g.models].sort()) {
        out.push([
          collection,
          model,
          r.firstName ?? "",
          r.lastName ?? "",
          r.phone ?? "",
          r.email ?? "",
          r.ownerName ?? "",
          intents,
        ]);
      }
    }
  }

  return { csv: toCsv(HEADER, out), rowCount: out.length, truncated };
}
