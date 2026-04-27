import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clients, activityEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
  try {
    const { id } = await params;
    const body = await request.json();

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && k !== "id") patch[k] = v;
    }

    db.update(clients).set(patch).where(eq(clients.id, id)).run();

    db.insert(activityEvents).values({
      id: randomUUID(),
      clientId: id,
      eventType: "edited",
      description: "Profile updated",
    }).run();

    revalidatePath(`/clients/${id}`);
    revalidatePath("/clients");
    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}