"use server";

import { db } from "@/lib/db";
import { prospects, unsubscribeList } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireAuth } from "./_shared";

interface BulkResult {
  ok: number;
  error?: string;
}

type TxHandle = Parameters<Parameters<typeof db.transaction>[0]>[0];

function runBulk(opts: {
  ids: string[];
  errorMessage: string;
  mutate(tx: TxHandle): number;
}): BulkResult {
  if (opts.ids.length === 0) return { ok: 0 };
  let ok = 0;
  try {
    db.transaction((tx) => {
      ok = opts.mutate(tx);
    });
  } catch {
    return { ok: 0, error: opts.errorMessage };
  }
  revalidatePath("/prospects");
  return { ok };
}

export async function bulkRejectProspects(ids: string[]): Promise<BulkResult> {
  await requireAuth();
  return runBulk({
    ids,
    errorMessage: "Failed to reject prospects",
    mutate(tx) {
      const r = tx
        .update(prospects)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(inArray(prospects.id, ids))
        .run();
      return r.changes ?? 0;
    },
  });
}

export async function bulkUnsubscribeProspects(ids: string[]): Promise<BulkResult> {
  await requireAuth();
  return runBulk({
    ids,
    errorMessage: "Failed to unsubscribe prospects",
    mutate(tx) {
      const rows = tx
        .select({ id: prospects.id, email: prospects.email })
        .from(prospects)
        .where(inArray(prospects.id, ids))
        .all();

      tx.update(prospects)
        .set({ status: "unsubscribed", updatedAt: new Date() })
        .where(inArray(prospects.id, ids))
        .run();

      for (const row of rows) {
        if (!row.email) continue;
        const alreadyUnsub = tx
          .select({ id: unsubscribeList.id })
          .from(unsubscribeList)
          .where(eq(unsubscribeList.email, row.email))
          .get();
        if (!alreadyUnsub) {
          tx.insert(unsubscribeList).values({ id: randomUUID(), email: row.email }).run();
        }
      }

      return rows.length;
    },
  });
}
