import { withAuth } from "@/lib/api-helpers";
import { findDuplicateClient } from "@/lib/duplicate-client";

export const GET = withAuth(async (_session, request: Request) => {
  const { searchParams } = new URL(request.url);
  const firstName = searchParams.get("firstName")?.trim() ?? "";
  const lastName = searchParams.get("lastName")?.trim() ?? "";
  const phone = searchParams.get("phone")?.trim() ?? "";
  const email = searchParams.get("email")?.trim() ?? "";

  // The warning surface matches on name too — two records for one name is
  // worth flagging to the person typing, even though POST won't block on it.
  const match = findDuplicateClient({ firstName, lastName, phone, email });
  return Response.json({ duplicate: match });
});
