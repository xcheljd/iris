import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/recover/route";
import { NextRequest } from "next/server";

describe("POST /api/recover - lookup step", () => {
  it("should return secret question for valid username", async () => {
    // The seed data has user "Marcus" with secret question
    const req = new NextRequest("http://localhost:3000/api/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step: "lookup",
        username: "Marcus",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("question");
    expect(typeof data.question).toBe("string");
    expect(data.question.length).toBeGreaterThan(0);
  });

  it("should return 400 when username is missing on lookup", async () => {
    const req = new NextRequest("http://localhost:3000/api/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: "lookup" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Username is required");
  });

  it("should return 404 for non-existent username", async () => {
    const req = new NextRequest("http://localhost:3000/api/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step: "lookup",
        username: "nonexistent-user-12345",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("If this account exists and has recovery options configured, you will see the security question.");
  });
});

describe("POST /api/recover - verify step", () => {
  it("should return 400 when fields are missing on verify", async () => {
    const req = new NextRequest("http://localhost:3000/api/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: "verify", username: "Marcus" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("All fields are required");
  });

  it("should return 400 when newPassword is too short", async () => {
    const req = new NextRequest("http://localhost:3000/api/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step: "verify",
        username: "Marcus",
        answer: "some answer",
        newPassword: "short",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("New password must be at least 6 characters");
  });

  it("should return 401 for incorrect answer", async () => {
    const req = new NextRequest("http://localhost:3000/api/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step: "verify",
        username: "Marcus",
        answer: "wrong answer definitely wrong",
        newPassword: "newpass123",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Incorrect answer");
  });

  // Regression: verify used to answer "No recovery options available for this
  // account" while lookup answered with the generic line, so comparing the two
  // replies told an unauthenticated caller whether a username existed. Both
  // steps now return the same message — this assertion changed deliberately.
  it("should return 404 for non-existent username on verify with the same message as lookup", async () => {
    const req = new NextRequest("http://localhost:3000/api/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step: "verify",
        username: "nonexistent-user-12345",
        answer: "some answer",
        newPassword: "newpass123",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("If this account exists and has recovery options configured, you will see the security question.");
  });

  // Regression: bcrypt hashes only the first 72 bytes, so a longer password
  // would have been stored truncated and authenticated on its prefix.
  it("should return 400 when newPassword exceeds 72 characters", async () => {
    const req = new NextRequest("http://localhost:3000/api/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step: "verify",
        username: "Marcus",
        answer: "some answer",
        newPassword: "x".repeat(73),
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("New password must be at most 72 characters");
  });
});

describe("POST /api/recover - malformed body", () => {
  // Regression: req.json() was unguarded, so a non-JSON body threw out of the
  // handler as a 500 instead of being reported as the client error it is.
  it("should return 400 for a body that is not JSON", async () => {
    const req = new NextRequest("http://localhost:3000/api/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request");
  });

  it("should return 400 for a JSON body that is not an object", async () => {
    const req = new NextRequest("http://localhost:3000/api/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request");
  });
});

describe("POST /api/recover - invalid step", () => {
  it("should return 400 for invalid step value", async () => {
    const req = new NextRequest("http://localhost:3000/api/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: "invalid" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid step");
  });
});
