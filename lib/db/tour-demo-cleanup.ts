import type Database from "better-sqlite3";
import { TOUR_DEMO_CLIENT_ID } from "@/lib/tour-demo-client";

/** The address the removed `ensureTourDemoClient` gave its demo row. */
const TOUR_DEMO_EMAIL = "alex.tourguide@example.com";

export interface TourDemoCleanupResult {
  clients: number;
  activityEvents: number;
  outreachLogs: number;
  promoMatches: number;
  approvalRequests: number;
  bannedCustomers: number;
  unsubscribeList: number;
  prospectsUnlinked: number;
}

/**
 * One-off removal of the legacy `__tour_demo__` client row.
 *
 * `ensureTourDemoClient` (removed in f3388ae) persisted the tour's example
 * client, owned by whoever toured first and on the email list, so it leaked
 * into lists, exports, analytics and email recipients. The tour now renders it
 * in memory (lib/tour-demo-client.ts); this deletes what old DBs still hold.
 *
 * Same sweep as `purgeClient`, in one transaction, plus the demo address's
 * suppression row when no other client uses it. The clients_fts row goes with
 * the client via the clients_fts_after_delete trigger (and if FTS was dropped
 * by scripts/drop-fts.mjs, the boot backfill only indexes surviving clients).
 * Idempotent: on a DB without the row every count is 0.
 */
export function purgeLegacyTourDemoClient(sqlite: Database.Database): TourDemoCleanupResult {
  const id = TOUR_DEMO_CLIENT_ID;
  const run = (sql: string, ...params: string[]) => sqlite.prepare(sql).run(...params).changes;

  return sqlite.transaction((): TourDemoCleanupResult => {
    const activityEvents = run("DELETE FROM activity_events WHERE client_id = ?", id);
    const outreachLogs = run("DELETE FROM outreach_logs WHERE client_id = ?", id);
    const promoMatches = run("DELETE FROM promo_matches WHERE client_id = ?", id);
    const approvalRequests = run("DELETE FROM approval_requests WHERE client_id = ?", id);
    // A prospect merged into the demo client is real imported data — unlink it,
    // as purgeClient does, rather than delete it.
    const prospectsUnlinked = run("UPDATE prospects SET graduated_to_client_id = NULL WHERE graduated_to_client_id = ?", id);
    const bannedCustomers = run("DELETE FROM banned_customers WHERE customer_id = ?", id);
    const unsubscribeList = run(
      `DELETE FROM unsubscribe_list
        WHERE lower(email) = ?
          AND EXISTS (SELECT 1 FROM clients WHERE id = ?)
          AND NOT EXISTS (SELECT 1 FROM clients WHERE id <> ? AND lower(email) = ?)`,
      TOUR_DEMO_EMAIL, id, id, TOUR_DEMO_EMAIL,
    );
    const clients = run("DELETE FROM clients WHERE id = ?", id);
    return { clients, activityEvents, outreachLogs, promoMatches, approvalRequests, bannedCustomers, unsubscribeList, prospectsUnlinked };
  })();
}
