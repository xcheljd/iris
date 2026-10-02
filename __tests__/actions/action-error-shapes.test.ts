import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { createSmartList, deletePromo, graduateProspect, graduateProspectIntoExistingClient } from "@/lib/actions";
import { bulkBanClients } from "@/lib/actions/bulk-clients";
import type { GraduateProspectInput } from "@/lib/validation/rvx";

// Regression (m10): several actions swallowed DB errors without logging,
// deletePromo had no try/catch at all, and the prospect-graduation actions
// threw a ZodError at the boundary instead of returning their error shapes.

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.mocked(getServerSession).mockResolvedValue(managerSession);
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("prospect graduation input", () => {
  it("graduateProspect returns { type: \"error\" } for invalid input instead of throwing", async () => {
    const result = await graduateProspect({ prospectId: "p", firstName: "", lastName: "X", preferredContact: "email" } as GraduateProspectInput);
    expect(result).toEqual({ type: "error", error: "First name is required" });
  });

  it("graduateProspectIntoExistingClient returns { error } for invalid enrichment instead of throwing", async () => {
    const result = await graduateProspectIntoExistingClient("p", "c", { email: "not-an-email" });
    expect(result).toEqual({ error: "Invalid email" });
  });
});

describe("DB failures are logged and returned", () => {
  it("deletePromo returns { error } and logs", async () => {
    const boom = new Error("disk I/O error");
    vi.spyOn(db, "transaction").mockImplementationOnce(() => { throw boom; });
    expect(await deletePromo("00000000-0000-0000-0000-000000000000")).toEqual({ error: "Failed to delete promo" });
    expect(consoleError).toHaveBeenCalledWith("deletePromo failed:", boom);
  });

  it("createSmartList logs the swallowed error", async () => {
    const boom = new Error("disk I/O error");
    vi.spyOn(db, "insert").mockImplementationOnce(() => { throw boom; });
    expect(await createSmartList("Swallowed error probe", {})).toEqual({ error: "Failed to create smart list" });
    expect(consoleError).toHaveBeenCalledWith("createSmartList failed:", boom);
  });

  it("bulk actions log the swallowed error", async () => {
    const boom = new Error("disk I/O error");
    vi.spyOn(db, "transaction").mockImplementationOnce(() => { throw boom; });
    expect(await bulkBanClients(["00000000-0000-0000-0000-000000000000"], "Other", "")).toEqual({ ok: 0, error: "Failed to ban clients" });
    expect(consoleError).toHaveBeenCalledWith("Failed to ban clients:", boom);
  });
});
