"use server";

import { db } from "@/lib/db";
import { prospects, unsubscribeList } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireAuth } from "./_shared";
import { normalizeEmail } from "@/lib/email-identity";

// Only active prospects move, as in the single-row reject/unsubscribe: a
// graduated, rejected or unsubscribed prospect must not be flipped again.
const ACTIVE = eq(prospects.status, "active");

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
        .where(and(inArray(prospects.id, ids), ACTIVE))
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
        .where(and(inArray(prospects.id, ids), ACTIVE))
        .all();

      tx.update(prospects)
        .set({ status: "unsubscribed", updatedAt: new Date() })
        .where(and(inArray(prospects.id, ids), ACTIVE))
        .run();

      // One query for the whole batch instead of one per row. Seeded with the
      // emails already on the list, then extended as we insert — two prospects
      // can share an email, and unsubscribe_list.email is UNIQUE. Normalized
      // both ways: the UNIQUE index is BINARY, so a mixed-case address would
      // otherwise land as a second row.
      const emails = [...new Set(rows.map((r) => normalizeEmail(r.email)).filter((e): e is string => !!e))];
      const alreadyUnsubbed = new Set(
        emails.length > 0
          ? tx.select({ email: unsubscribeList.email }).from(unsubscribeList).where(inArray(sql`lower(${unsubscribeList.email})`, emails)).all().map((r) => normalizeEmail(r.email))
          : [],
      );

      for (const row of rows) {
        const email = normalizeEmail(row.email);
        if (!email || alreadyUnsubbed.has(email)) continue;
        tx.insert(unsubscribeList).values({ id: randomUUID(), email }).run();
        alreadyUnsubbed.add(email);
      }

      return rows.length;
    },
  });
}
