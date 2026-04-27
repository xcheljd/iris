import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clients, clientTags, activityEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { clientId, tag } = body;

    if (!clientId || !tag) {
      return NextResponse.json({ error: "clientId and tag are required" }, { status: 400 });
    }

    const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const tags = Array.from(new Set([...(client.tags || []), tag]));
    db.update(clients).set({ tags, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();

    const existing = db.select().from(clientTags).where(eq(clientTags.name, tag)).get();
    if (existing) {
      db.update(clientTags).set({ usageCount: existing.usageCount + 1 }).where(eq(clientTags.id, existing.id)).run();
    }

    db.insert(activityEvents).values({
      id: randomUUID(),
      clientId,
      eventType: "tag_added",
      description: `Tag added: ${tag}`,
    }).run();

    revalidatePath(`/clients/${clientId}`);
    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to add tag" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { clientId, tag } = body;

    if (!clientId || !tag) {
      return NextResponse.json({ error: "clientId and tag are required" }, { status: 400 });
    }

    const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const tags = (client.tags || []).filter((t) => t !== tag);
    db.update(clients).set({ tags, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();

    db.insert(activityEvents).values({
      id: randomUUID(),
      clientId,
      eventType: "tag_removed",
      description: `Tag removed: ${tag}`,
    }).run();

    revalidatePath(`/clients/${clientId}`);
    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to remove tag" }, { status: 500 });
  }
}