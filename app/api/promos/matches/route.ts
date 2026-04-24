import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { promoMatches, promoWatches, clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const promoId = searchParams.get("promoId");

  if (!promoId) {
    return NextResponse.json({ error: "promoId is required" }, { status: 400 });
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
    .where(eq(promoMatches.promoId, promoId))
    .all();

  return NextResponse.json(matches);
}