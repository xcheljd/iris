import { withAuth } from "@/lib/api-helpers";
import { getTagsSync } from "@/lib/queries";

// Tag suggestions for the client form's picker, most used first.
export const GET = withAuth(async () => Response.json(getTagsSync().map(({ name, usageCount }) => ({ name, usageCount }))));
