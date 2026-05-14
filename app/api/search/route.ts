import { type NextRequest } from "next/server";
import { withAuth } from "@/lib/api-helpers";
import {
  searchClients,
  searchProspects,
  searchSmartLists,
  getRecentlyViewedClients,
} from "@/lib/queries";

export const GET = withAuth(async (session, req: NextRequest) => {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const isManager = session.user.role === "manager";
  const employeeId = !isManager ? session.user.id : undefined;

  // Empty input: surface recently-viewed clients so the palette opens to
  // useful content instead of just nav routes.
  if (!q) {
    const recent = await getRecentlyViewedClients(employeeId, 5);
    return Response.json({
      hits: [],
      prospects: [],
      lists: [],
      recentlyViewed: recent.map((c) => ({
        id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone, snippet: null,
      })),
      isPhoneticFallback: false,
    });
  }

  // Non-empty: run all three searches in parallel.
  const [clientsResult, prospectsResult, listsResult] = await Promise.all([
    searchClients(q, employeeId),
    searchProspects(q),
    searchSmartLists(q, employeeId),
  ]);

  return Response.json({
    hits: clientsResult.clients.map((c) => ({
      id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone, snippet: c.snippet,
    })),
    prospects: prospectsResult,
    lists: listsResult,
    recentlyViewed: [],
    isPhoneticFallback: clientsResult.isPhoneticFallback,
  });
});
