import { withAuth } from "@/lib/api-helpers";
import { getCatalogMap } from "@/lib/actions/model-catalog";

// GET /api/catalog — model → collection map for product-of-interest
// collection autofill, plus the viewer's manager flag (decides whether
// the collection field is locked at entry). Read-only; all mutations go
// through manager server actions.
export const GET = withAuth(async (session) => {
  return Response.json({
    map: getCatalogMap(),
    isManager: session.user?.role === "manager",
  });
});
