import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, activityEvents } from "@/lib/db/schema";
import { eq, desc, or, sql as rawSql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

// GET /api/clients — list all clients
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const client = db.select().from(clients).where(eq(clients.id, id)).get();
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    return NextResponse.json(client);
  }

  const all = db.select().from(clients).orderBy(desc(clients.heatScore)).all();
  return NextResponse.json(all);
}

// POST /api/clients — create a new client
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const id = randomUUID();

    const existing = db.select().from(clients).where(
      or(
        body.email ? eq(clients.email, body.email) : rawSql`0`,
        body.phone ? eq(clients.phone, body.phone) : rawSql`0`,
      )
    ).get();

    if (existing) {
      return NextResponse.json({ error: "Duplicate found", duplicate: existing }, { status: 409 });
    }

    db.insert(clients).values({
      id,
      firstName: body.firstName,
      lastName: body.lastName || null,
      phone: body.phone || null,
      email: body.email || null,
      customerId: body.customerId || null,
      productsOfInterest: body.productsOfInterest || [],
      notes: body.notes || null,
      onEmailList: body.onEmailList ?? false,
      source: body.source || "Walk-in",
      birthday: body.birthday || null,
      anniversary: body.anniversary || null,
      tags: body.tags || [],
    }).run();

    db.insert(activityEvents).values({
      id: randomUUID(),
      clientId: id,
      eventType: "created",
      description: `Client added`,
    }).run();

    revalidatePath("/clients");
    return NextResponse.json({ id });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
  }
}

// PUT /api/clients — update a client
export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: "Client ID is required" }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && k !== "id") patch[k] = v;
    }

    db.update(clients).set(patch).where(eq(clients.id, id)).run();

    db.insert(activityEvents).values({
      id: randomUUID(),
      clientId: id,
      eventType: "edited",
      description: `Profile updated`,
      metadata: { fieldChanges: data },
    }).run();

    revalidatePath(`/clients/${id}`);
    revalidatePath("/clients");
    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}