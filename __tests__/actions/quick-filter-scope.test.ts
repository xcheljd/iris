import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getEmailRecipients } from "@/lib/actions/email-recipients";
import { exportClientsCsv } from "@/lib/actions/clients-csv-export";
import { getClientsWithEmployeePaginated, getCustomListClients } from "@/lib/queries";
import { clientFiltersToSearchParams, describeClientFilters, smartListToClientFilters } from "@/lib/smart-list-filters";

// Regression: with the list on ?filter=hot, the email-recipients dialog, the
// CSV export and "Save as Smart List" dropped the quick filter and operated
// on every client matching the other filters.

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";
const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Test Manager", role: "manager" as const, firstName: "Test", lastName: "Manager" },
  expires: "2099-12-31T23:59:59.000Z",
};

const PREFIX = "qfscope-";
const HOT_EMAIL = `${PREFIX}hot@test.com`;
const COLD_EMAIL = `${PREFIX}cold@test.com`;
const ids = [randomUUID(), randomUUID()];
// contactQ narrows to this file's two clients; filter=hot should drop the cold one.
const filters = { contactQ: PREFIX, filter: "hot" };

beforeAll(() => {
  for (const [i, [email, heatLevel]] of ([[HOT_EMAIL, "hot"], [COLD_EMAIL, "cold"]] as const).entries()) {
    db.insert(clients).values({
      id: ids[i],
      firstName: "QuickFilter",
      lastName: heatLevel,
      email,
      employeeId: ASSOCIATE_ID,
      source: "Walk-in",
      productsOfInterest: [],
      tags: [],
      onEmailList: true,
      status: "active",
      heatLevel,
      heatScore: heatLevel === "hot" ? 90 : 5,
    }).run();
  }
  vi.mocked(getServerSession).mockResolvedValue(managerSession);
});

afterAll(() => {
  db.delete(clients).where(inArray(clients.id, ids)).run();
});

describe("the ?filter= quick filter reaches every scope that mirrors the list", () => {
  it("the listing itself shows only the hot client", async () => {
    const { rows } = await getClientsWithEmployeePaginated(undefined, filters);
    expect(rows.map((r) => r.client.email)).toEqual([HOT_EMAIL]);
  });

  it("email recipients honor filter=hot", async () => {
    expect((await getEmailRecipients({ contactQ: PREFIX })).clients.emails).toEqual([COLD_EMAIL, HOT_EMAIL]);
    expect((await getEmailRecipients(filters)).clients.emails).toEqual([HOT_EMAIL]);
  });

  it("CSV export honors filter=hot", async () => {
    const { csv, rowCount } = await exportClientsCsv(filters);
    expect(rowCount).toBe(1);
    expect(csv).toContain(HOT_EMAIL);
    expect(csv).not.toContain(COLD_EMAIL);
  });

  it("a smart list saved from the filtered view keeps the quick filter", async () => {
    // The save dialog stores the filters object as-is; reading it back must keep `filter`.
    const { rows } = await getCustomListClients(filters);
    expect(rows.map((r) => r.email)).toEqual([HOT_EMAIL]);
    expect(smartListToClientFilters(filters).filter).toBe("hot");
    expect(clientFiltersToSearchParams(smartListToClientFilters(filters)).get("filter")).toBe("hot");
  });

  it("shows the quick filter as a chip in the dialogs and ignores unknown ids", () => {
    expect(describeClientFilters(filters)).toContain("Hot clients");
    expect(smartListToClientFilters({ filter: "toString" }).filter).toBeUndefined();
  });
});
