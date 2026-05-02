import type { Client, OutreachLog } from "./db/schema";
import { MS_PER_DAY } from "./constants";

// ── Heat-score policy constants ──────────────────────────────────────
const SCORE_HAS_PURCHASE = 15;
const SCORE_RECENT_PURCHASE = 10;
const SCORE_RESPONDED_OUTREACH = 10;
const SCORE_ON_EMAIL_LIST = 5;
const SCORE_HAS_INTERESTS = 5;
const SCORE_HAS_BIRTHDAY = 3;
const PENALTY_STALE_OUTREACH = -15;
const PENALTY_VERY_STALE_OUTREACH = -10;
const PENALTY_UNSUBSCRIBED = -20;

const RECENT_PURCHASE_WINDOW_DAYS = 90;
const OUTREACH_STALE_DAYS = 90;
const OUTREACH_VERY_STALE_DAYS = 180;

const HEAT_THRESHOLD_HOT = 70;
const HEAT_THRESHOLD_WARM = 40;
// ─────────────────────────────────────────────────────────────────────

export function calcHeatScore(
  client: Pick<Client, "onEmailList" | "productsOfInterest" | "birthday" | "status" | "lastOutreachAt" | "lastPurchaseAt">,
  recentOutreach: Pick<OutreachLog, "outcome" | "date">[] = [],
): { score: number; level: "hot" | "warm" | "cold" } {
  let score = 0;
  const now = Date.now();
  const days = (d: Date | null | undefined) => (d ? (now - new Date(d).getTime()) / MS_PER_DAY : Infinity);

  if (client.lastPurchaseAt) score += SCORE_HAS_PURCHASE;
  if (client.lastPurchaseAt && days(client.lastPurchaseAt) <= RECENT_PURCHASE_WINDOW_DAYS) score += SCORE_RECENT_PURCHASE;

  const responded90 = recentOutreach.some(
    (o) => o.outcome === "responded" || o.outcome === "wants_to_come_in" || o.outcome === "purchased",
  );
  if (responded90) score += SCORE_RESPONDED_OUTREACH;
  if (client.onEmailList) score += SCORE_ON_EMAIL_LIST;
  if (client.productsOfInterest && client.productsOfInterest.length > 0) score += SCORE_HAS_INTERESTS;
  if (client.birthday) score += SCORE_HAS_BIRTHDAY;

  const lastOutDays = days(client.lastOutreachAt);
  if (lastOutDays > OUTREACH_STALE_DAYS) score += PENALTY_STALE_OUTREACH;
  if (lastOutDays > OUTREACH_VERY_STALE_DAYS) score += PENALTY_VERY_STALE_OUTREACH;
  if (client.status === "unsubscribed") score += PENALTY_UNSUBSCRIBED;

  score = Math.max(0, Math.min(100, score));
  const level = score >= HEAT_THRESHOLD_HOT ? "hot" : score >= HEAT_THRESHOLD_WARM ? "warm" : "cold";
  return { score, level };
}
