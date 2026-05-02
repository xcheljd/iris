import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const firstName = searchParams.get("firstName");
  const phone = searchParams.get("phone");
  const email = searchParams.get("email");

  if (!firstName && !phone && !email) {
    return NextResponse.json({ duplicate: null });
  }

  const conditions = [];
  if (phone) conditions.push(eq(clients.phone, phone));
  if (email) conditions.push(eq(clients.email, email));

  // Also check by first name + phone combo
  if (firstName && phone) {
    // Use a broader check: same first name and phone
  }

  let duplicate = null;

  if (conditions.length > 0) {
    const match = db.select().from(clients).where(or(...conditions)).get();
    if (match) duplicate = match;
  }

  // If no match on phone/email, check first name match
  if (!duplicate && firstName) {
    const allClients = db.select({
      id: clients.id,
      firstName: clients.firstName,
      lastName: clients.lastName,
      phone: clients.phone,
      email: clients.email,
    }).from(clients).all();

    const nameMatch = allClients.find(
      (c) => c.firstName.toLowerCase() === firstName.toLowerCase()
    );
    if (nameMatch) duplicate = nameMatch;
  }

  return NextResponse.json({ duplicate });
}
