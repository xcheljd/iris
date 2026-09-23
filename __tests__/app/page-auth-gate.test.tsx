import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import type { ReactElement } from "react";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import DashboardPage from "@/app/(app)/page";
import ClientListPage from "@/app/(app)/clients/page";
import FollowUpsPage from "@/app/(app)/follow-ups/page";
import AnalyticsPage from "@/app/(app)/analytics/page";
import CollectionsPage from "@/app/(app)/analytics/collections/page";
import SmartListsPage from "@/app/(app)/smart-lists/page";
import PromosPage from "@/app/(app)/promos/page";

// Regression: the middleware only verifies the JWT signature, so a deactivated
// employee's cookie still reaches these pages. There the `jwt` callback throws,
// getSession() returns null, and the loaders computed
// `employeeId = session?.user?.id ?? undefined` — no filter at all, i.e. the
// manager-wide view of every client, follow-up and analytics number.

const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23"; // Test associate (setup.ts)

const associateSession: Session = {
  user: { id: ASSOCIATE_ID, name: "Test Associate", role: "associate", firstName: "Test", lastName: "Associate" },
  expires: "2099-12-31T23:59:59.000Z",
};

const searchParams = Promise.resolve({});

type PageEl = ReactElement<{ children: ReactElement<Record<string, unknown>, (p: Record<string, unknown>) => Promise<ReactElement>> }>;

/** Each page is `<Suspense><Fetcher …/></Suspense>`; run the loader directly. */
function runLoader(page: PageEl) {
  const fetcher = page.props.children;
  return fetcher.type(fetcher.props);
}

const pages: [string, () => PageEl][] = [
  ["dashboard", () => DashboardPage() as PageEl],
  ["clients", () => ClientListPage({ searchParams }) as PageEl],
  ["follow-ups", () => FollowUpsPage() as PageEl],
  ["analytics", () => AnalyticsPage({ searchParams }) as PageEl],
  ["analytics/collections", () => CollectionsPage() as PageEl],
  ["smart-lists", () => SmartListsPage({ searchParams }) as PageEl],
  ["promos", () => PromosPage({ searchParams }) as PageEl],
];

describe("page auth gate", () => {
  describe("a deactivated employee's token", () => {
    const INACTIVE_ID = randomUUID();

    beforeAll(() => {
      db.insert(employees).values({
        id: INACTIVE_ID,
        name: "Gate Inactive",
        firstName: "Gate",
        lastName: "Inactive",
        username: `gate-inactive-${INACTIVE_ID.slice(0, 8)}`,
        passwordHash: "x",
        role: "associate",
        active: false,
      }).run();
    });

    afterAll(() => {
      db.delete(employees).where(eq(employees.id, INACTIVE_ID)).run();
    });

    it("stops being a session, which is why getSession() comes back null", async () => {
      const token = { id: INACTIVE_ID, role: "associate", firstName: "Gate", lastName: "Inactive" } as JWT;
      await expect(
        authOptions.callbacks!.jwt!({ token } as Parameters<NonNullable<typeof authOptions.callbacks>["jwt"] & object>[0]),
      ).rejects.toThrow("no longer active");
    });
  });

  describe.each(pages)("%s", (_name, page) => {
    it("redirects to /login instead of loading unscoped data when there is no session", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);
      await expect(runLoader(page())).rejects.toMatchObject({
        digest: expect.stringContaining("/login"),
      });
    });

    it("still loads for a live session", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession);
      await expect(runLoader(page())).resolves.toBeTruthy();
    });
  });

  it("scopes an associate's page data to their own records", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);

    const followUps = (await runLoader(FollowUpsPage() as PageEl)) as ReactElement<{
      overdue: { log: { employeeId: string } }[];
      upcoming: { log: { employeeId: string } }[];
    }>;
    for (const row of [...followUps.props.overdue, ...followUps.props.upcoming]) {
      expect(row.log.employeeId).toBe(ASSOCIATE_ID);
    }

    const collections = (await runLoader(CollectionsPage() as PageEl)) as ReactElement<{
      clients: { employeeId: string | null }[];
    }>;
    expect(collections.props.clients.length).toBeGreaterThan(0);
    for (const c of collections.props.clients) expect(c.employeeId).toBe(ASSOCIATE_ID);
  });
});
