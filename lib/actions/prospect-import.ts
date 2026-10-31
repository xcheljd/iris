"use server";
import { db } from "@/lib/db";
import { clients, bannedCustomers, unsubscribeList, importBatches, prospects } from "@/lib/db/schema";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { parseProspectCsv, findWithinImportDuplicates, selectBestRecord, serializeDuplicatesToCsv, dedupeKey, type ProspectImportRow } from "@/lib/prospect-import-parser";
import { requireManager } from "./_shared";

export interface ProspectImportAnalysis {
  newCount: number;
  alreadyClientCount: number;
  alreadyProspectCount: number;
  bannedCount: number;
  unsubscribedCount: number;
  deletedCount: number;
  duplicateCount: number;
  duplicateCsv: string;
  readyToImport: ProspectImportRow[];
  parseErrors: string[];
}

async function categorizeProspectRows(rows: ProspectImportRow[]): Promise<{
  newRows: ProspectImportRow[];
  alreadyClientCount: number;
  alreadyProspectCount: number;
  bannedCount: number;
  unsubscribedCount: number;
  deletedCount: number;
}> {
  // Batch-load all comparison sets
  const allBanned = db.select({ email: bannedCustomers.email, phone: bannedCustomers.phone }).from(bannedCustomers).all();
  const bannedEmails = new Set(allBanned.map((r) => r.email?.toLowerCase()).filter(Boolean) as string[]);
  const bannedPhones = new Set(allBanned.map((r) => r.phone?.replace(/\D/g, "")).filter(Boolean) as string[]);

  const allUnsub = db.select({ email: unsubscribeList.email }).from(unsubscribeList).all();
  const unsubEmails = new Set(allUnsub.map((r) => r.email.toLowerCase()));

  const allClients = db
    .select({ email: clients.email, phone: clients.phone, deletedAt: clients.deletedAt })
    .from(clients)
    .all();
  const activeClientEmails = new Set<string>();
  const activeClientPhones = new Set<string>();
  const deletedClientEmails = new Set<string>();
  const deletedClientPhones = new Set<string>();
  for (const c of allClients) {
    if (c.deletedAt) {
      if (c.email) deletedClientEmails.add(c.email.toLowerCase());
      if (c.phone) deletedClientPhones.add(c.phone.replace(/\D/g, ""));
    } else {
      if (c.email) activeClientEmails.add(c.email.toLowerCase());
      if (c.phone) activeClientPhones.add(c.phone.replace(/\D/g, ""));
    }
  }

  const allProspects = db
    .select({
      email: prospects.email,
      phone: prospects.phone,
      customerId: prospects.importCustomerId,
    })
    .from(prospects)
    .all();
  // A customer number already imported from an earlier file matches here
  // even when the row has no email or phone to match on.
  const prospectImportIds = new Set(allProspects.map((r) => r.customerId).filter(Boolean) as string[]);
  const prospectEmails = new Set(allProspects.map((r) => r.email?.toLowerCase()).filter(Boolean) as string[]);
  const prospectPhones = new Set(allProspects.map((r) => r.phone?.replace(/\D/g, "")).filter(Boolean) as string[]);

  const newRows: ProspectImportRow[] = [];
  let alreadyClientCount = 0;
  let alreadyProspectCount = 0;
  let bannedCount = 0;
  let unsubscribedCount = 0;
  let deletedCount = 0;

  for (const row of rows) {
    const email = row.email?.toLowerCase() ?? null;
    const phone = row.phone ?? null;

    if (row.customerId && prospectImportIds.has(row.customerId)) {
      alreadyProspectCount++;
    } else if (email && bannedEmails.has(email) || phone && bannedPhones.has(phone)) {
      bannedCount++;
    } else if (email && unsubEmails.has(email)) {
      unsubscribedCount++;
    } else if (
      (email && deletedClientEmails.has(email)) ||
      (phone && deletedClientPhones.has(phone))
    ) {
      deletedCount++;
    } else if (
      (email && activeClientEmails.has(email)) ||
      (phone && activeClientPhones.has(phone))
    ) {
      alreadyClientCount++;
    } else if (
      (email && prospectEmails.has(email)) ||
      (phone && prospectPhones.has(phone))
    ) {
      alreadyProspectCount++;
    } else {
      newRows.push(row);
    }
  }

  return { newRows, alreadyClientCount, alreadyProspectCount, bannedCount, unsubscribedCount, deletedCount };
}

function deduplicateProspectRows(
  rows: ProspectImportRow[],
  dupeGroups: Map<string, ProspectImportRow[]>,
): { deduped: ProspectImportRow[]; dupeRows: ProspectImportRow[] } {
  const dupeRowSet = new Set<ProspectImportRow>();
  const seen = new Set<ProspectImportRow>();
  const deduped: ProspectImportRow[] = [];

  for (const row of rows) {
    const group = dupeGroups.get(dedupeKey(row));
    if (group) {
      for (const r of group) dupeRowSet.add(r);
      const best = selectBestRecord(group);
      if (!seen.has(best)) {
        seen.add(best);
        deduped.push(best);
      }
    } else {
      deduped.push(row);
    }
  }

  return { deduped, dupeRows: Array.from(dupeRowSet) };
}

export async function analyzeProspectImport(csvText: string): Promise<ProspectImportAnalysis | { error: string }> {
  await requireManager();

  const { rows, parseErrors } = parseProspectCsv(csvText);
  if (rows.length === 0) return { error: parseErrors[0] ?? "No prospect rows found in the file." };

  const { deduped, dupeRows } = deduplicateProspectRows(rows, findWithinImportDuplicates(rows));

  try {
    const { newRows, alreadyClientCount, alreadyProspectCount, bannedCount, unsubscribedCount, deletedCount } =
      await categorizeProspectRows(deduped);

    return {
      newCount: newRows.length,
      alreadyClientCount,
      alreadyProspectCount,
      bannedCount,
      unsubscribedCount,
      deletedCount,
      duplicateCount: dupeRows.length,
      duplicateCsv: serializeDuplicatesToCsv(dupeRows),
      readyToImport: newRows,
      parseErrors,
    };
  } catch (err) {
    console.error("analyzeProspectImport failed:", err);
    return { error: "Failed to analyze import file. Please try again." };
  }
}

export async function importProspects(
  csvText: string,
): Promise<{ importedCount: number } | { error: string }> {
  const user = await requireManager();

  const { rows, parseErrors } = parseProspectCsv(csvText);
  if (rows.length === 0) return { error: parseErrors[0] ?? "No prospect rows found in the file." };

  const { deduped } = deduplicateProspectRows(rows, findWithinImportDuplicates(rows));

  try {
    const { newRows } = await categorizeProspectRows(deduped);

    const batchId = randomUUID();

    db.transaction((tx) => {
      tx.insert(importBatches).values({
        id: batchId,
        totalRows: rows.length,
        importedCount: newRows.length,
        importedBy: user.id,
      }).run();

      for (const row of newRows) {
        tx.insert(prospects).values({
          id: randomUUID(),
          importCustomerId: row.customerId,
          importBatchId: batchId,
          firstName: row.firstName,
          lastName: row.lastName,
          phone: row.phone,
          email: row.email,
          productsOfInterest: [],
        }).run();
      }
    });

    revalidatePath("/prospects");
    return { importedCount: newRows.length };
  } catch (err) {
    console.error("importProspects failed:", err);
    return { error: "Import failed. Please try again." };
  }
}
