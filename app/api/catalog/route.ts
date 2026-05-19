import { withAuth } from "@/lib/api-helpers";
import { getCatalogMap, getCatalogIndex } from "@/lib/actions/model-catalog";

// GET /api/catalog — model → collection map for product-of-interest
// collection autofill, plus a richer model → {collection, brand} index
// for client-side derive-at-read, plus the viewer's manager flag.
// Read-only; all mutations go through manager server actions.
export const GET = withAuth(async (session) => {
  return Response.json({
    map: getCatalogMap(),
    index: Object.fromEntries(getCatalogIndex()),
    isManager: session.user?.role === "manager",
  });
});
