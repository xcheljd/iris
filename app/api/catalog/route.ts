import { withAuth } from "@/lib/api-helpers";
import { getCatalogIndex } from "@/lib/actions/model-catalog";

// GET /api/catalog — model → collection map for product-of-interest
// collection autofill, plus a richer model → {collection, brand} index
// for client-side derive-at-read, plus the viewer's manager flag.
// Read-only; all mutations go through manager server actions.
export const GET = withAuth(async (session) => {
  const idx = getCatalogIndex();
  const map: Record<string, string> = {};
  for (const [k, v] of idx) map[k] = v.collection;
  return Response.json({
    map,
    index: Object.fromEntries(idx),
    isManager: session.user?.role === "manager",
  });
});
