import { withAuth } from "@/lib/api-helpers";
import { countFollowUpsDue } from "@/lib/queries";

// Same scope as the Follow-Ups page: managers see the whole store, associates
// see follow-ups for the clients they own.
export const GET = withAuth(async (session) => {
  const employeeId = session.user.role === "manager" ? undefined : session.user.id;
  return Response.json({ count: await countFollowUpsDue(employeeId) });
});
