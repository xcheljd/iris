import { withAuth } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { clientPatchSchema } from "@/lib/validation/client";
import { saveClientEdits } from "@/lib/actions/clients";

export const GET = withAuth(async (session, request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;

  const client = db.select().from(clients).where(eq(clients.id, id)).get();
  // 404 rather than 403 for a foreign client — a 403 would confirm the id exists.
  if (!client || (session.user.role !== "manager" && client.employeeId !== session.user.id)) {
    return Response.json({ error: "Client not found" }, { status: 404 });
  }

  return Response.json(client);
});

export const PUT = withAuth(async (session, request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;
    const client = db.select().from(clients).where(eq(clients.id, id)).get();
    if (!client) return Response.json({ error: "Client not found" }, { status: 404 });
    if (session.user.role !== "manager" && client.employeeId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    const parsed = clientPatchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await saveClientEdits(id, parsed.data);
    if (result?.error) return Response.json({ error: result.error }, { status: 403 });
    return Response.json({ success: true });
  } catch (_error) {
    return Response.json({ error: "Failed to update client" }, { status: 500 });
  }
});
