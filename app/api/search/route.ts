import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchClients } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") || "";
  if (!q || q.length < 1) return NextResponse.json([]);
  const isManager = session.user.role === "manager";
  const employeeId = !isManager ? session.user.id : undefined;
  const rows = await searchClients(q, employeeId);
  return NextResponse.json(rows.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone })));
}
