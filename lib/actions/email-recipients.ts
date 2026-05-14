"use server";

import { db } from "@/lib/db";
import { clients, prospects, employees } from "@/lib/db/schema";
import { and, eq, isNotNull, notInArray, type SQL } from "drizzle-orm";
import { buildClientFilterConds, type ClientFilterParams } from "@/lib/client-filter-conds";
import { requireAuth } from "./_shared";

/** Filter shape accepted by the Email Recipients server action. */
export type ClientEmailFilters = ClientFilterParams;

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

  const { conds: filterConds, needsEmployeeJoin } = buildClientFilterConds(filters);

  /* ---- clients query ---- */
  const clientConds: (SQL<unknown> | undefined)[] = [
    notInArray(clients.status, ["banned", "deleted", "unsubscribed"]),
    eq(clients.onEmailList, true),
    isNotNull(clients.email),
    employeeId ? eq(clients.employeeId, employeeId) : undefined,
    ...filterConds,
  ];

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
