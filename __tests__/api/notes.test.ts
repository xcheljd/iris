import { describe, it, expect } from "vitest";
import { POST, DELETE } from "@/app/api/notes/route";
import { GET } from "@/app/api/clients/route";
import { db } from "@/lib/db";
import { activityEvents, clients } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

describe("POST /api/notes", () => {
  it("should add a note to an existing client", async () => {
    // Get an existing client
    const allReq = new Request("http://localhost:3000/api/clients");
    const allRes = await GET(allReq);
    const allData = await allRes.json();
    const clientId = allData[0].id;

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
    expect(data.error).toBe("clientId and text are required");
  });

  it("should return 400 when text is missing", async () => {
    const req = new Request("http://localhost:3000/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "some-id" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("clientId and text are required");
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
    expect(data.error).toBe("clientId and text are required");
  });

  it("should return 404 when client does not exist", async () => {
    const req = new Request("http://localhost:3000/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "nonexistent-client-id",
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
    // First add a note to get a noteId
    const allReq = new Request("http://localhost:3000/api/clients");
    const allRes = await GET(allReq);
    const allData = await allRes.json();
    const clientId = allData[0].id;

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
    expect(data.error).toBe("noteId is required");
  });

  it("should succeed even for non-existent noteId (idempotent delete)", async () => {
    const req = new Request("http://localhost:3000/api/notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: "nonexistent-note-id" }),
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
