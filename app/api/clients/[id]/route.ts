import { withAuth } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { clients, activityEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { clientPatchSchema } from "@/lib/validation/client";

export const GET = withAuth(async (_session, request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;

  const client = db.select().from(clients).where(eq(clients.id, id)).get();
  if (!client) {
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

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) patch[k] = v;
    }

    db.update(clients).set(patch).where(eq(clients.id, id)).run();

    db.insert(activityEvents).values({
      id: randomUUID(),
      clientId: id,
      eventType: "edited",
      description: "Profile updated",
      metadata: { fieldChanges: parsed.data },
    }).run();

    revalidatePath(`/clients/${id}`);
    revalidatePath("/clients");
    return Response.json({ success: true });
  } catch (_error) {
    return Response.json({ error: "Failed to update client" }, { status: 500 });
  }
});
