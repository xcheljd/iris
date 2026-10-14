import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { GET, POST } from "@/app/api/backup/status/route";
import { db } from "@/lib/db";
import { meta } from "@/lib/db/schema";
import { like, or, eq } from "drizzle-orm";
import { getMeta, setMeta } from "@/lib/db/meta";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const manager: Session = { user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null }, expires: "2099-12-31T23:59:59.000Z" };
const associate: Session = { user: { id: "assoc", name: "Jordan", role: "associate", firstName: "Jordan", lastName: null }, expires: "2099-12-31T23:59:59.000Z" };

const post = (body: unknown) => POST(new Request("http://x/api/backup/status", { method: "POST", body: JSON.stringify(body) }));

let saved: string | undefined;
beforeEach(() => {
  saved = getMeta("last_backup_at");
  db.delete(meta).where(or(eq(meta.key, "last_backup_at"), like(meta.key, "backup_snooze_until:%"))).run();
  vi.mocked(getServerSession).mockResolvedValue(manager);
});
afterEach(() => {
  db.delete(meta).where(or(eq(meta.key, "last_backup_at"), like(meta.key, "backup_snooze_until:%"))).run();
  if (saved) setMeta("last_backup_at", saved);
});

describe("/api/backup/status", () => {
  it("is managers only", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associate);
    expect((await GET()).status).toBe(403);
    expect((await post({ action: "backed-up" })).status).toBe(403);
  });

  it("starts with no backup and no snooze", async () => {
    expect(await (await GET()).json()).toEqual({ lastBackupAt: null, snoozedUntil: null });
  });

  it("records a backup in the database", async () => {
    const before = Date.now();
    const body = await (await post({ action: "backed-up" })).json();
    expect(new Date(body.lastBackupAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  // Regression: "Remind me" used to save today as the last backup date.
  it("snoozing never touches the last backup date", async () => {
    const until = new Date(Date.now() + 6 * 3_600_000).toISOString();
    const body = await (await post({ action: "snooze", until })).json();
    expect(body).toEqual({ lastBackupAt: null, snoozedUntil: until });
  });

  it("snoozes per manager", async () => {
    await post({ action: "snooze", until: new Date(Date.now() + 3_600_000).toISOString() });
    vi.mocked(getServerSession).mockResolvedValue({ ...manager, user: { ...manager.user, id: "other-manager" } });
    expect((await (await GET()).json()).snoozedUntil).toBeNull();
  });

  it("rejects snoozes in the past or more than two days out, and junk", async () => {
    expect((await post({ action: "snooze", until: new Date(Date.now() - 1000).toISOString() })).status).toBe(400);
    expect((await post({ action: "snooze", until: new Date(Date.now() + 3 * 86_400_000).toISOString() })).status).toBe(400);
    expect((await post({ action: "nope" })).status).toBe(400);
  });
});
