"use server";
import { db } from "@/lib/db";
import { clients, bannedCustomers, unsubscribeList, rvxImportBatches, prospects } from "@/lib/db/schema";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { parseRvxCsv, findWithinImportDuplicates, selectBestRecord, serializeDuplicatesToCsv, type RvxRawRow } from "@/lib/rvx-parser";
import { requireManager } from "./_shared";

export interface RvxAnalysisResult {
  newCount: number;
  alreadyClientCount: number;
  bannedCount: number;
  unsubscribedCount: number;
  deletedCount: number;
  duplicateCount: number;
  duplicateCsv: string;
  readyToImport: RvxRawRow[];
  reportStartDate: Date;
  reportEndDate: Date;
  parseErrors: string[];
}

async function categorizeRvxRows(rows: RvxRawRow[]): Promise<{
  newRows: RvxRawRow[];
  alreadyClientCount: number;
  bannedCount: number;
  unsubscribedCount: number;
  deletedCount: number;
}> {
  // Batch-load all comparison sets (4 queries total)
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

  const newRows: RvxRawRow[] = [];
  let alreadyClientCount = 0;
  let bannedCount = 0;
  let unsubscribedCount = 0;
  let deletedCount = 0;

  for (const row of rows) {
    const email = row.email?.toLowerCase() ?? null;
    const phone = row.phone ?? null;

    if (email && bannedEmails.has(email) || phone && bannedPhones.has(phone)) {
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
    } else {
      newRows.push(row);
    }
  }

  return { newRows, alreadyClientCount, bannedCount, unsubscribedCount, deletedCount };
}

export async function analyzeRvxImport(csvText: string): Promise<RvxAnalysisResult | { error: string }> {
  await requireManager();

  const { rows, reportStartDate, reportEndDate, parseErrors } = parseRvxCsv(csvText);

  const dupeGroups = findWithinImportDuplicates(rows);
  const dupeRowSet = new Set<RvxRawRow>();
  const dedupedBestSet = new Set<RvxRawRow>();
  const deduped: RvxRawRow[] = [];

  for (const row of rows) {
    const key = [
      row.firstName.toLowerCase(),
      row.lastName?.toLowerCase() ?? "",
      row.phone ?? "",
      row.email?.toLowerCase() ?? "",
    ].join("|");
    const group = dupeGroups.get(key);
    if (group) {
      for (const r of group) dupeRowSet.add(r);
      const best = selectBestRecord(group);
      if (!dedupedBestSet.has(best)) {
        dedupedBestSet.add(best);
        deduped.push(best);
      }
    } else {
      deduped.push(row);
    }
  }
  const dupeRows = Array.from(dupeRowSet);

  try {
    const { newRows, alreadyClientCount, bannedCount, unsubscribedCount, deletedCount } =
      await categorizeRvxRows(deduped);

    return {
      newCount: newRows.length,
      alreadyClientCount,
      bannedCount,
      unsubscribedCount,
      deletedCount,
      duplicateCount: dupeRows.length,
      duplicateCsv: serializeDuplicatesToCsv(dupeRows),
      readyToImport: newRows,
      reportStartDate,
      reportEndDate,
      parseErrors,
    };
  } catch {
    return { error: "Failed to analyze import file. Please try again." };
  }
}

export async function importProspectsFromRvx(
  csvText: string,
): Promise<{ importedCount: number } | { error: string }> {
  const user = await requireManager();

  const { rows, reportStartDate, reportEndDate } = parseRvxCsv(csvText);

  const dupeGroups = findWithinImportDuplicates(rows);
  const deduped: RvxRawRow[] = [];
  const seen = new Set<RvxRawRow>();

  for (const row of rows) {
    const key = [
      row.firstName.toLowerCase(),
      row.lastName?.toLowerCase() ?? "",
      row.phone ?? "",
      row.email?.toLowerCase() ?? "",
    ].join("|");
    const group = dupeGroups.get(key);
    if (group) {
      const best = selectBestRecord(group);
      if (!seen.has(best)) {
        seen.add(best);
        deduped.push(best);
      }
    } else {
      deduped.push(row);
    }
  }

  try {
    const { newRows } = await categorizeRvxRows(deduped);

    const batchId = randomUUID();

    db.transaction(() => {
      db.insert(rvxImportBatches).values({
        id: batchId,
        reportStartDate,
        reportEndDate,
        totalRows: rows.length,
        importedCount: newRows.length,
        importedBy: user.id,
      }).run();

      for (const row of newRows) {
        db.insert(prospects).values({
          id: randomUUID(),
          rvxCustomerId: row.customerId,
          rvxStoreId: row.storeId,
          rvxSpend: row.spend,
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
  } catch {
    return { error: "Import failed. Please try again." };
  }
}
