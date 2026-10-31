import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { GET as GETCatalog } from "@/app/api/catalog/route";
import { GET as GETBackup } from "@/app/api/backup/download/route";
import { sqlite } from "@/lib/db";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const managerSession: Session = {
  user: { id: "2d7a352d-53a0-4544-b515-902e7dd59206", name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

const associateSession: Session = {
  user: { id: "590628cf-d623-456d-bdad-d16ab0ec2b23", name: "Test Associate", role: "associate", firstName: "Test", lastName: "Associate" },
  expires: "2099-12-31T23:59:59.000Z",
};

beforeEach(() => {
  vi.mocked(getServerSession).mockResolvedValue(managerSession);
});

// GET /api/catalog — withAuth: any authenticated user (associate or manager).
describe("GET /api/catalog", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GETCatalog();
    expect(res.status).toBe(401);
  });

  it("returns catalog data for authenticated associate", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    const res = await GETCatalog();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("map");
    expect(data).toHaveProperty("index");
    expect(data.isManager).toBe(false);
  });

  it("sets isManager true for manager session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const res = await GETCatalog();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isManager).toBe(true);
  });

  it("map values are strings (collection names)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const res = await GETCatalog();
    const data = await res.json();
    for (const v of Object.values(data.map)) {
      expect(typeof v).toBe("string");
    }
  });
});

// GET /api/backup/download — withManagerAuth: manager-only. Reads the real
// test DB from disk (DATABASE_PATH = .vitest/iris.db in the test env).
describe("GET /api/backup/download", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GETBackup();
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as associate", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    const res = await GETBackup();
    expect(res.status).toBe(403);
  });

  it("returns binary SQLite file for manager", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const res = await GETBackup();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-sqlite3");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="iris-backup-\d{4}-\d{2}-\d{2}\.db"$/);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
    // SQLite magic bytes
    const magic = Buffer.from(buf).subarray(0, 6).toString("ascii");
    expect(magic).toBe("SQLite");
  });

  // Regression: the route used to readFileSync the main DB file, which in WAL
  // mode is missing every commit since the last checkpoint.
  it("snapshot includes rows committed since the last WAL checkpoint", async () => {
    const ids = [randomUUID(), randomUUID()];
    const insert = sqlite.prepare(
      "INSERT INTO clients (id, first_name, last_name, employee_id, date_added) VALUES (?, 'Backup', 'Probe', ?, unixepoch())",
    );
    // A file, not an in-memory deserialize: the snapshot's header is in WAL
    // mode, which a deserialized database cannot open.
    const snapshotDir = mkdtempSync(join(tmpdir(), "iris-backup-test-"));
    const snapshotPath = join(snapshotDir, "snapshot.db");
    try {
      for (const id of ids) insert.run(id, associateSession.user.id);
      const res = await GETBackup();
      writeFileSync(snapshotPath, Buffer.from(await res.arrayBuffer()));
      const snapshot = new Database(snapshotPath);
      const rows = snapshot
        .prepare(`SELECT id FROM clients WHERE id IN (?, ?)`)
        .all(...ids) as { id: string }[];
      snapshot.close();
      expect(rows.map((r) => r.id).sort()).toEqual([...ids].sort());
    } finally {
      sqlite.prepare("DELETE FROM clients WHERE id IN (?, ?)").run(...ids);
      rmSync(snapshotDir, { recursive: true, force: true });
    }
  });
});
