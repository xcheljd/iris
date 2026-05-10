import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq, or, and, notInArray, sql as rawSql } from "drizzle-orm";
import { normalizePhone } from "@/lib/utils";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const firstName = searchParams.get("firstName")?.trim() ?? "";
  const lastName = searchParams.get("lastName")?.trim() ?? "";
  const rawPhone = searchParams.get("phone")?.trim() ?? "";
  const email = searchParams.get("email")?.trim() ?? "";

  if (!firstName && !rawPhone && !email) {
    return NextResponse.json({ duplicate: null });
  }

  const phone = normalizePhone(rawPhone);

  const conditions = [];
  if (phone) conditions.push(eq(clients.phone, phone));
  if (email) conditions.push(eq(clients.email, email));
  if (firstName && lastName) {
    conditions.push(
      and(
        rawSql`lower(${clients.firstName}) = ${firstName.toLowerCase()}`,
        rawSql`lower(${clients.lastName}) = ${lastName.toLowerCase()}`,
      ),
    );
  }

  if (conditions.length === 0) {
    return NextResponse.json({ duplicate: null });
  }

  const match = db.select({
    id: clients.id,
    firstName: clients.firstName,
    lastName: clients.lastName,
    phone: clients.phone,
    email: clients.email,
  }).from(clients).where(
    and(
      notInArray(clients.status, ["banned", "deleted"]),
      or(...conditions),
    ),
  ).get();
  return NextResponse.json({ duplicate: match ?? null });
}
