import { type NextRequest } from "next/server";
import { withAuth } from "@/lib/api-helpers";
import { searchClients } from "@/lib/queries";

export const GET = withAuth(async (session, req: NextRequest) => {
  const q = req.nextUrl.searchParams.get("q") || "";
  if (!q || q.length < 1) return Response.json({ hits: [], isPhoneticFallback: false });
  const isManager = session.user.role === "manager";
  const employeeId = !isManager ? session.user.id : undefined;
  const result = await searchClients(q, employeeId);
  return Response.json({
    hits: result.clients.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      phone: c.phone,
      snippet: c.snippet,
    })),
    isPhoneticFallback: result.isPhoneticFallback,
  });
});
