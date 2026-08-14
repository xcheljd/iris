import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { POST, DELETE } from "@/app/api/notes/route";
import { db } from "@/lib/db";
import { activityEvents, clients } from "@/lib/db/schema";
import { eq, desc, ne } from "drizzle-orm";
import { randomUUID } from "crypto";

const managerSession: Session = {
  user: { id: "2d7a352d-53a0-4544-b515-902e7dd59206", name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

beforeEach(() => {
  vi.mocked(getServerSession).mockResolvedValue(managerSession);
});

describe("POST /api/notes", () => {
  it("should add a note to an existing client", async () => {
    // Use the global test fixture client (see __tests__/setup.ts)
    const clientId = "e18e3ba8-b3b1-4bc1-b0f2-f13a219dd30b";

    const req = new Request("http://localhost:3000/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        text: "Test note from integration test",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify the note was created as an activity event
    const events = db.select().from(activityEvents)
      .where(eq(activityEvents.clientId, clientId))
      .orderBy(desc(activityEvents.createdAt))
      .all();
    const noteEvent = events.find(
      (e) => e.eventType === "note_added" && e.description === "Test note from integration test"
    );
    expect(noteEvent).toBeDefined();
    expect(noteEvent?.employeeId).toBe(managerSession.user.id);
  });

  it("should return 400 when clientId is missing", async () => {
    const req = new Request("http://localhost:3000/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Some note" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request");
  });

  it("should return 400 when text is missing", async () => {
    const req = new Request("http://localhost:3000/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "00000000-0000-0000-0000-000000000001" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request");
  });

  it("should return 400 when both clientId and text are missing", async () => {
    const req = new Request("http://localhost:3000/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request");
  });

  it("should return 404 when client does not exist", async () => {
    const req = new Request("http://localhost:3000/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "00000000-0000-0000-0000-000000000000",
        text: "Note for nobody",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Client not found");
  });
});

describe("DELETE /api/notes", () => {
  it("should delete a note by noteId", async () => {
    // Use the global test fixture client (see __tests__/setup.ts)
    const clientId = "e18e3ba8-b3b1-4bc1-b0f2-f13a219dd30b";

    // Create a note
    const addReq = new Request("http://localhost:3000/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        text: "Note to be deleted",
      }),
    });
    await POST(addReq);

    // Find the created event
    const events = db.select().from(activityEvents)
      .where(eq(activityEvents.clientId, clientId))
      .orderBy(desc(activityEvents.createdAt))
      .all();
    const noteEvent = events.find(
      (e) => e.eventType === "note_added" && e.description === "Note to be deleted"
    );
    expect(noteEvent).toBeDefined();

    // Delete it
    const deleteReq = new Request("http://localhost:3000/api/notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: noteEvent!.id }),
    });
    const deleteRes = await DELETE(deleteReq);
    expect(deleteRes.status).toBe(200);
    const deleteData = await deleteRes.json();
    expect(deleteData.success).toBe(true);

    // Verify it's gone
    const checkEvent = db.select().from(activityEvents)
      .where(eq(activityEvents.id, noteEvent!.id))
      .get();
    expect(checkEvent).toBeUndefined();
  });

  it("should return 400 when noteId is missing", async () => {
    const req = new Request("http://localhost:3000/api/notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request");
  });

  it("should return 404 for non-existent noteId", async () => {
    const req = new Request("http://localhost:3000/api/notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: "00000000-0000-0000-0000-000000000000" }),
    });
    const res = await DELETE(req);
    expect(res.status).toBe(404);
  });
});

// Plan 016 — associate-session coverage. Note: the notes route has no GET
// handler, and POST/DELETE use withAuth + an inline ownership check (not
// withManagerAuth): associates may act on their own clients, and get 403 on
// clients they do not own. So the "manager-only" rejection from the original
// plan does not apply here; we test the real ownership boundary instead.
describe("associate session", () => {
  const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";
  const associateSession: Session = {
    user: { id: ASSOCIATE_ID, name: "Test Associate", role: "associate", firstName: "Test", lastName: "Associate" },
    expires: "2099-12-31T23:59:59.000Z",
  };
  // Dedicated client owned by the associate. The setup.ts Test Client's owner
  // is not guaranteed here: earlier suites in the full run transfer it, so
  // ownership tests must own their fixture (same lesson as plan 017).
  const OWN_CLIENT_ID = randomUUID();

  beforeEach(() => {
    db.insert(clients).values({
      id: OWN_CLIENT_ID,
      firstName: "Assoc",
      lastName: "Fixture",
      employeeId: ASSOCIATE_ID,
      source: "Walk-in",
      productsOfInterest: [],
      tags: [],
      onEmailList: true,
      status: "active",
    }).run();
  });

  afterEach(() => {
    db.delete(activityEvents).where(eq(activityEvents.clientId, OWN_CLIENT_ID)).run();
    db.delete(clients).where(eq(clients.id, OWN_CLIENT_ID)).run();
  });

  it("POST /api/notes — associate can add a note to their own client", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    const req = new Request("http://localhost:3000/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: OWN_CLIENT_ID, text: "Associate note on own client" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    const events = db.select().from(activityEvents)
      .where(eq(activityEvents.clientId, OWN_CLIENT_ID))
      .all();
    const noteEvent = events.find(
      (e) => e.eventType === "note_added" && e.description === "Associate note on own client"
    );
    expect(noteEvent).toBeDefined();
    expect(noteEvent?.employeeId).toBe(ASSOCIATE_ID);
  });

  it("POST /api/notes — associate is rejected on another employee's client", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    // A client owned by someone else (any seed client not owned by the associate)
    const otherClient = db.select().from(clients).where(ne(clients.employeeId, ASSOCIATE_ID)).get();
    expect(otherClient).toBeDefined();

    const req = new Request("http://localhost:3000/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: otherClient!.id, text: "Should be forbidden" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Forbidden");
  });

  it("POST /api/notes — unauthenticated returns 401", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new Request("http://localhost:3000/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: OWN_CLIENT_ID, text: "No session" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("DELETE /api/notes — associate can delete their own note", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);

    // Create a note as the associate
    const addReq = new Request("http://localhost:3000/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: OWN_CLIENT_ID, text: "Associate note to delete" }),
    });
    await POST(addReq);
    const events = db.select().from(activityEvents)
      .where(eq(activityEvents.clientId, OWN_CLIENT_ID))
      .all();
    const noteEvent = events.find(
      (e) => e.eventType === "note_added" && e.description === "Associate note to delete"
    );
    expect(noteEvent).toBeDefined();

    const deleteReq = new Request("http://localhost:3000/api/notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: noteEvent!.id }),
    });
    const deleteRes = await DELETE(deleteReq);
    expect(deleteRes.status).toBe(200);
    const deleteData = await deleteRes.json();
    expect(deleteData.success).toBe(true);
  });
});
