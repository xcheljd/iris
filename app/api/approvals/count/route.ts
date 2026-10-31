import { withManagerAuth } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { approvalRequests } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export const GET = withManagerAuth(async () => {
  const result = db
    .select({ c: sql<number>`count(*)` })
    .from(approvalRequests)
    .where(eq(approvalRequests.status, "pending"))
    .get();

  return Response.json({ count: result?.c ?? 0 });
});
