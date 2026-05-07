import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, clientTags, activityEvents } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const tagBodySchema = z.object({
  clientId: z.string().uuid(),
  tag: z.string().min(1).max(50),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.user.role !== "manager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();
    const parsed = tagBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { clientId, tag } = parsed.data;

    const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const tags = Array.from(new Set([...(client.tags || []), tag]));
    db.transaction((tx) => {
      tx.update(clients).set({ tags, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
      const existing = tx.select().from(clientTags).where(eq(clientTags.name, tag)).get();
      if (existing) {
        tx.update(clientTags).set({ usageCount: sql`${clientTags.usageCount} + 1` }).where(eq(clientTags.id, existing.id)).run();
      } else {
        tx.insert(clientTags).values({ id: randomUUID(), name: tag, usageCount: 1 }).run();
      }
      tx.insert(activityEvents).values({
        id: randomUUID(),
        clientId,
        eventType: "tag_added",
        description: `Tag added: ${tag}`,
        metadata: { tagName: tag },
      }).run();
    });

    revalidatePath(`/clients/${clientId}`);
    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to add tag" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.user.role !== "manager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();
    const parsed = tagBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { clientId, tag } = parsed.data;

    const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const tags = (client.tags || []).filter((t) => t !== tag);
    db.transaction((tx) => {
      tx.update(clients).set({ tags, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
      const existing = tx.select().from(clientTags).where(eq(clientTags.name, tag)).get();
      if (existing) {
        tx.update(clientTags).set({ usageCount: sql`MAX(0, ${clientTags.usageCount} - 1)` }).where(eq(clientTags.id, existing.id)).run();
      }
      tx.insert(activityEvents).values({
        id: randomUUID(),
        clientId,
        eventType: "tag_removed",
        description: `Tag removed: ${tag}`,
        metadata: { tagName: tag },
      }).run();
    });

    revalidatePath(`/clients/${clientId}`);
    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to remove tag" }, { status: 500 });
  }
}