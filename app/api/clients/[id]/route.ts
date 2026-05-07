import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, activityEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { clientPatchSchema } from "@/lib/validation/client";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  const client = db.select().from(clients).where(eq(clients.id, id)).get();
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  return NextResponse.json(client);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const { id } = await params;
    const client = db.select().from(clients).where(eq(clients.id, id)).get();
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    if (session.user.role !== "manager" && client.employeeId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    const parsed = clientPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
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
      metadata: { fieldChanges: body },
    }).run();

    revalidatePath(`/clients/${id}`);
    revalidatePath("/clients");
    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}