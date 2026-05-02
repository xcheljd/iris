import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const all = db.select().from(employees).orderBy(employees.firstName).all();
  const safe = all.map(({ passwordHash: _passwordHash, secretAnswerHash: _secretAnswerHash, ...rest }) => rest);
  return NextResponse.json(safe);
}