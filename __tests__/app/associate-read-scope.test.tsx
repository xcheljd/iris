import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import type { ReactElement } from "react";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import EditClientPage from "@/app/(app)/clients/[id]/edit/page";
import SettingsPage from "@/app/(app)/settings/page";

// M1: the edit page and the settings trash handed an associate other books'
// clients — the edit page had no ownership check (the detail page did), and
// settings loaded every deleted client regardless of role.

const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23"; // setup.ts
const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206"; // setup.ts

const associateSession: Session = {
  user: { id: ASSOCIATE_ID, name: "Test Associate", role: "associate", firstName: "Test", lastName: "Associate" },
  expires: "2099-12-31T23:59:59.000Z",
};
const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

const ownId = randomUUID();
const foreignId = randomUUID();
const ownDeletedId = randomUUID();
const foreignDeletedId = randomUUID();

beforeAll(() => {
  const rows: [string, string, "active" | "deleted"][] = [
    [ownId, ASSOCIATE_ID, "active"],
    [foreignId, MANAGER_ID, "active"],
    [ownDeletedId, ASSOCIATE_ID, "deleted"],
    [foreignDeletedId, MANAGER_ID, "deleted"],
  ];
  for (const [id, employeeId, status] of rows) {
    db.insert(clients).values({
      id,
      firstName: "Scope",
      lastName: "Probe",
      employeeId,
      status,
      deletedAt: status === "deleted" ? new Date() : null,
    }).run();
  }
});

afterAll(() => {
  db.delete(clients).where(inArray(clients.id, [ownId, foreignId, ownDeletedId, foreignDeletedId])).run();
});

describe("client edit page", () => {
  const load = (id: string) => EditClientPage({ params: Promise.resolve({ id }) });

  it("404s an associate on another employee's client", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    await expect(load(foreignId)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("loads the associate's own client", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    await expect(load(ownId)).resolves.toBeTruthy();
  });

  it("loads any client for a manager", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    await expect(load(foreignId)).resolves.toBeTruthy();
  });
});

describe("settings deleted clients", () => {
  type SettingsEl = ReactElement<{ children: ReactElement<Record<string, never>, () => Promise<ReactElement<{ deletedClients: { id: string }[] }>>> }>;
  async function deletedIds() {
    // The page is `<Suspense><SettingsFetcher /></Suspense>`; run the loader.
    const fetcher = (SettingsPage() as SettingsEl).props.children;
    const content = await fetcher.type();
    return content.props.deletedClients.map((c) => c.id);
  }

  it("shows an associate only their own deleted clients", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    const ids = await deletedIds();
    expect(ids).toContain(ownDeletedId);
    expect(ids).not.toContain(foreignDeletedId);
  });

  it("shows a manager every deleted client", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const ids = await deletedIds();
    expect(ids).toContain(ownDeletedId);
    expect(ids).toContain(foreignDeletedId);
  });
});
