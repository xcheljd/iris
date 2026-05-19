import { withAuth } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { clients, activityEvents } from "@/lib/db/schema";
import { eq, desc, or, notInArray, sql as rawSql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { clientCreateSchema, clientPatchSchema } from "@/lib/validation/client";
import { applyClientPatch } from "@/lib/actions/clients";
import { recordProductsOfInterest } from "@/lib/actions/model-catalog";

// GET /api/clients — list all clients
export const GET = withAuth(async (_session, request: Request) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const client = db.select().from(clients).where(eq(clients.id, id)).get();
    if (!client) {
      return Response.json({ error: "Client not found" }, { status: 404 });
    }
    return Response.json(client);
  }

  const pageSize = Math.min(parseInt(searchParams.get("limit") ?? "500", 10) || 500, 500);
  const pageOffset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);
  const all = db.select().from(clients).where(notInArray(clients.status, ["banned", "deleted"])).orderBy(desc(clients.heatScore)).limit(pageSize).offset(pageOffset).all();
  return Response.json(all);
});

// POST /api/clients — create a new client
export const POST = withAuth(async (_session, request: Request) => {
  try {
    const body = await request.json();
    const parsed = clientCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
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
      return Response.json({ error: "Duplicate found", duplicate: existing }, { status: 409 });
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
      preferredContact: data.preferredContact,
      onEmailList: data.onEmailList,
      source: data.source,
      birthday: data.birthday ?? null,
      anniversary: data.anniversary ?? null,
      tags: data.tags,
    }).run();

    // Feed the durable catalog from the new client's interests — an
    // uncatalogued model becomes a provisional needs-review row.
    recordProductsOfInterest(db, data.productsOfInterest);

    db.insert(activityEvents).values({
      id: randomUUID(),
      clientId: id,
      eventType: "created",
      description: `Client added`,
    }).run();

    revalidatePath("/clients");
    return Response.json({ id });
  } catch (_error) {
    return Response.json({ error: "Failed to create client" }, { status: 500 });
  }
});

// PUT /api/clients — update a client
export const PUT = withAuth(async (session, request: Request) => {
  try {
    const body = await request.json();
    const { id, ...rest } = body;

    if (!id || typeof id !== "string") {
      return Response.json({ error: "Client ID is required" }, { status: 400 });
    }

    const client = db.select().from(clients).where(eq(clients.id, id)).get();
    if (!client) return Response.json({ error: "Client not found" }, { status: 404 });
    if (session.user.role !== "manager" && client.employeeId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = clientPatchSchema.safeParse(rest);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    await applyClientPatch(id, parsed.data as Record<string, unknown>);
    return Response.json({ success: true });
  } catch (_error) {
    return Response.json({ error: "Failed to update client" }, { status: 500 });
  }
});
