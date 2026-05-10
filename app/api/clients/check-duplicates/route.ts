import { withAuth } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq, or, and, notInArray, sql as rawSql } from "drizzle-orm";
import { normalizePhone } from "@/lib/utils";

export const GET = withAuth(async (_session, request: Request) => {
  const { searchParams } = new URL(request.url);
  const firstName = searchParams.get("firstName")?.trim() ?? "";
  const lastName = searchParams.get("lastName")?.trim() ?? "";
  const rawPhone = searchParams.get("phone")?.trim() ?? "";
  const email = searchParams.get("email")?.trim() ?? "";

  if (!firstName && !rawPhone && !email) {
    return Response.json({ duplicate: null });
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
    return Response.json({ duplicate: null });
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
  return Response.json({ duplicate: match ?? null });
});
