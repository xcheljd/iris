import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, activityEvents } from "@/lib/db/schema";
import { eq, desc, or, notInArray, sql as rawSql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { clientCreateSchema, clientPatchSchema } from "@/lib/validation/client";

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

  const pageSize = Math.min(parseInt(searchParams.get("limit") ?? "500", 10) || 500, 500);
  const pageOffset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);
  const all = db.select().from(clients).where(notInArray(clients.status, ["banned", "deleted"])).orderBy(desc(clients.heatScore)).limit(pageSize).offset(pageOffset).all();
  return NextResponse.json(all);
}

// POST /api/clients — create a new client
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const parsed = clientCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const data = parsed.data;
    const id = randomUUID();

    const existing = db.select().from(clients).where(
      or(
        data.email ? eq(clients.email, data.email) : rawSql`0`,
        data.phone ? eq(clients.phone, data.phone) : rawSql`0`,
      )
    ).get();

    if (existing) {
      return NextResponse.json({ error: "Duplicate found", duplicate: existing }, { status: 409 });
    }

    db.insert(clients).values({
      id,
      firstName: data.firstName,
      lastName: data.lastName ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      customerId: data.customerId ?? null,
      productsOfInterest: data.productsOfInterest,
      notes: data.notes ?? null,
      onEmailList: data.onEmailList,
      source: data.source,
      birthday: data.birthday ?? null,
      anniversary: data.anniversary ?? null,
      tags: data.tags,
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
    const { id, ...rest } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Client ID is required" }, { status: 400 });
    }

    const client = db.select().from(clients).where(eq(clients.id, id)).get();
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    if (session.user.role !== "manager" && client.employeeId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = clientPatchSchema.safeParse(rest);
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
      description: `Profile updated`,
      metadata: { fieldChanges: parsed.data },
    }).run();

    revalidatePath(`/clients/${id}`);
    revalidatePath("/clients");
    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}