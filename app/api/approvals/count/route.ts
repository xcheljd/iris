import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { approvalRequests } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.user.role !== "manager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = db
    .select({ c: sql<number>`count(*)` })
    .from(approvalRequests)
    .where(eq(approvalRequests.status, "pending"))
    .get();

  return NextResponse.json({ count: result?.c ?? 0 });
}
