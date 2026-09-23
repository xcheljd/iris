// Bulk heat recompute. Kept apart from heat-score.ts so the scoring rules
// stay a pure module that unit tests can import without opening the DB.
import { db } from "@/lib/db";
import { clients, outreachLogs, type OutreachLog } from "@/lib/db/schema";
import { getMeta, setMeta } from "@/lib/db/meta";
import { calcHeatScore } from "@/lib/heat-score";
import { MS_PER_DAY, HEAT_LOOKBACK_DAYS } from "@/lib/constants";
import { and, eq, gte, ne } from "drizzle-orm";
import { format } from "date-fns";

export const LAST_HEAT_RECALC_KEY = "last_heat_recalc";

/**
 * Recompute one client's stored heat. Every write that changes a scored field
 * calls this. It lives here, not in lib/actions/, because every export of a
 * "use server" module is a callable endpoint — and this one takes any client id
 * and has no auth check of its own.
 */
export async function recalcHeat(clientId: string) {
  try {
    const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
    if (!c) return;
    const ninetyDaysAgo = new Date(Date.now() - HEAT_LOOKBACK_DAYS * MS_PER_DAY);
    const last90 = db.select({ outcome: outreachLogs.outcome, date: outreachLogs.date }).from(outreachLogs).where(and(eq(outreachLogs.clientId, clientId), gte(outreachLogs.date, ninetyDaysAgo))).all();
    const { score, level } = calcHeatScore(c, last90);
    db.update(clients).set({ heatScore: score, heatLevel: level, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
  } catch (err) {
    console.error(`recalcHeat failed for client ${clientId}:`, err);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function recalcAllHeatIn(tx: Tx): number {
  const cutoff = new Date(Date.now() - HEAT_LOOKBACK_DAYS * MS_PER_DAY);
  const logsByClient = new Map<string, Pick<OutreachLog, "outcome" | "date">[]>();
  for (const log of tx
    .select({ clientId: outreachLogs.clientId, outcome: outreachLogs.outcome, date: outreachLogs.date })
    .from(outreachLogs)
    .where(gte(outreachLogs.date, cutoff))
    .all()) {
    const list = logsByClient.get(log.clientId) ?? [];
    list.push(log);
    logsByClient.set(log.clientId, list);
  }

  let changed = 0;
  for (const c of tx.select().from(clients).where(ne(clients.status, "deleted")).all()) {
    const { score, level } = calcHeatScore(c, logsByClient.get(c.id) ?? []);
    if (score === c.heatScore && level === c.heatLevel) continue;
    // updatedAt deliberately untouched: time passing is not an edit.
    tx.update(clients).set({ heatScore: score, heatLevel: level }).where(eq(clients.id, c.id)).run();
    changed++;
  }
  return changed;
}

/** Recompute every non-deleted client's stored heat in one transaction. Returns rows changed. */
export function recalcAllHeat(): number {
  return db.transaction((tx) => recalcAllHeatIn(tx));
}

/**
 * Run recalcAllHeat at most once per local calendar day. The time-based parts
 * of the score (recent purchase, stale outreach) decay without any write to
 * the client, so something has to re-apply them. Returns whether it ran.
 */
export function recalcAllHeatDaily(): boolean {
  const today = format(new Date(), "yyyy-MM-dd");
  return db.transaction((tx) => {
    if (getMeta(LAST_HEAT_RECALC_KEY, tx) === today) return false;
    recalcAllHeatIn(tx);
    setMeta(LAST_HEAT_RECALC_KEY, today, tx);
    return true;
  });
}
