import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { exportClientsCsv } from "@/lib/actions/clients-csv-export";

// Regression (m7): toIsoDate() used toISOString(), so an evening-local
// timestamp exported as the next (UTC) day.

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";
const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Test Manager", role: "manager" as const, firstName: "Test", lastName: "Manager" },
  expires: "2099-12-31T23:59:59.000Z",
};

const id = randomUUID();
const EMAIL = "csvdates-evening@test.com";
let savedTz: string | undefined;

beforeAll(() => {
  savedTz = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  // 2026-09-24 20:00 PDT — already Sep 25 in UTC.
  const evening = new Date("2026-09-25T03:00:00.000Z");
  db.insert(clients).values({
    id,
    firstName: "CsvDates",
    lastName: "Evening",
    email: EMAIL,
    employeeId: ASSOCIATE_ID,
    source: "Walk-in",
    productsOfInterest: [],
    tags: [],
    onEmailList: false,
    status: "active",
    lastOutreachAt: evening,
    createdAt: evening,
  }).run();
  vi.mocked(getServerSession).mockResolvedValue(managerSession);
});

afterAll(() => {
  db.delete(clients).where(eq(clients.id, id)).run();
  process.env.TZ = savedTz;
});

describe("exportClientsCsv dates", () => {
  it("exports an 8pm-local timestamp with that local day's date", async () => {
    expect(new Date("2026-09-25T03:00:00.000Z").getHours()).toBe(20);

    const { csv } = await exportClientsCsv({ contactQ: EMAIL });
    const [header, row] = csv.trim().split(/\r?\n/);
    const cols = header.split(",");
    const cells = row.split(",");
    expect(cells[cols.indexOf("Last Contact")]).toBe("2026-09-24");
    expect(cells[cols.indexOf("Date Added")]).toBe("2026-09-24");
  });
});
