import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { outreachTemplates } from "@/lib/db/schema";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const all = db.select().from(outreachTemplates).orderBy(outreachTemplates.name).all();
  return NextResponse.json(all);
}