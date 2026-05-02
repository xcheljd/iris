import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { promoMatches, promoWatches, clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

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