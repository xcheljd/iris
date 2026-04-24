import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { activityEvents, clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { clientId, text } = body;

    if (!clientId || !text) {
      return NextResponse.json({ error: "clientId and text are required" }, { status: 400 });
    }

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
  } catch (error) {
    return NextResponse.json({ error: "Failed to add note" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { noteId } = body;

    if (!noteId) {
      return NextResponse.json({ error: "noteId is required" }, { status: 400 });
    }

    db.delete(activityEvents).where(eq(activityEvents.id, noteId)).run();

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}