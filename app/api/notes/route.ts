import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { activityEvents, clients } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";

const notePostSchema = z.object({
  clientId: z.string().uuid(),
  text: z.string().min(1).max(2000),
});
const noteDeleteSchema = z.object({ noteId: z.string().uuid() });

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const parsed = notePostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { clientId, text } = parsed.data;

    const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    db.insert(activityEvents).values({
      id: randomUUID(),
      clientId,
      eventType: "note_added",
      description: text,
      metadata: { notePreview: text.substring(0, 100) },
    }).run();

    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to add note" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const parsed = noteDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { noteId } = parsed.data;

    db.delete(activityEvents).where(and(eq(activityEvents.id, noteId), eq(activityEvents.eventType, "note_added"))).run();

    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}