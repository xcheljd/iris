import { withManagerAuth } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { modelCatalog } from "@/lib/db/schema";
import { or, eq, isNotNull, sql } from "drizzle-orm";

export const GET = withManagerAuth(async () => {
  const result = db
    .select({ c: sql<number>`count(*)` })
    .from(modelCatalog)
    .where(or(eq(modelCatalog.needsReview, true), isNotNull(modelCatalog.flaggedCollection)))
    .get();

  return Response.json({ count: result?.c ?? 0 });
});
