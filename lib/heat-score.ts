import type { Client, OutreachLog } from "./db/schema";

export function calcHeatScore(
  client: Pick<Client, "onEmailList" | "productsOfInterest" | "birthday" | "status" | "lastOutreachAt" | "lastPurchaseAt">,
  recentOutreach: Pick<OutreachLog, "outcome" | "date">[] = [],
): { score: number; level: "hot" | "warm" | "cold" } {
  let score = 0;
  const now = Date.now();
  const days = (d: Date | null | undefined) => (d ? (now - new Date(d).getTime()) / 86400000 : Infinity);

  if (client.lastPurchaseAt) score += 15;
  if (client.lastPurchaseAt && days(client.lastPurchaseAt) <= 90) score += 10;

  const responded90 = recentOutreach.some(
    (o) => o.outcome === "responded" || o.outcome === "wants_to_come_in" || o.outcome === "purchased",
  );
  if (responded90) score += 10;
  if (client.onEmailList) score += 5;
  if (client.productsOfInterest && client.productsOfInterest.length > 0) score += 5;
  if (client.birthday) score += 3;

  const lastOutDays = days(client.lastOutreachAt);
  if (lastOutDays > 90) score -= 15;
  if (lastOutDays > 180) score -= 10;
  if (client.status === "unsubscribed") score -= 20;

  score = Math.max(0, Math.min(100, score));
  const level = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
  return { score, level };
}
