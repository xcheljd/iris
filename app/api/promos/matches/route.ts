import { withAuth } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { promoMatches, promoWatches, clients } from "@/lib/db/schema";
import { and, eq, isNull, notInArray } from "drizzle-orm";

export const GET = withAuth(async (_session, request: Request) => {
  const { searchParams } = new URL(request.url);
  const promoId = searchParams.get("promoId");

  if (!promoId) {
    return Response.json({ error: "promoId is required" }, { status: 400 });
  }

  const matches = db
    .select({
      match: promoMatches,
      client: clients,
      promo: promoWatches,
    })
    .from(promoMatches)
    .leftJoin(clients, eq(promoMatches.clientId, clients.id))
    .leftJoin(promoWatches, eq(promoMatches.promoId, promoWatches.id))
    // Exclude orphaned/soft-deleted clients (mirrors getPromoMatchCounts).
    .where(and(
      eq(promoMatches.promoId, promoId),
      isNull(clients.deletedAt),
      notInArray(clients.status, ["deleted"]),
    ))
    .all();

  return Response.json(matches);
});
