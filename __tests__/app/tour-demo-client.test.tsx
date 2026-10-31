import { vi, describe, it, expect } from "vitest";
import type { ReactElement } from "react";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import ClientDetailPage from "@/app/(app)/clients/[id]/page";
import { TOUR_DEMO_CLIENT_ID } from "@/lib/tour-demo-client";
import type { FullClient } from "@/components/client-provider";

// M6: ensureTourDemoClient inserted one shared "__tour_demo__" row owned by
// whoever toured first — every other associate's tour step 404'd on it — and
// the row (on the email list) leaked into lists, exports and recipients.

const sessions: Session[] = [
  { user: { id: "590628cf-d623-456d-bdad-d16ab0ec2b23", name: "Test Associate", role: "associate", firstName: "Test", lastName: "Associate" }, expires: "2099-12-31T23:59:59.000Z" },
  { user: { id: "2d7a352d-53a0-4544-b515-902e7dd59206", name: "Marcus", role: "manager", firstName: "Marcus", lastName: null }, expires: "2099-12-31T23:59:59.000Z" },
];

type PageEl = ReactElement<{ children: ReactElement<{ params: Promise<{ id: string }> }, (p: { params: Promise<{ id: string }> }) => Promise<ReactElement<{ client: FullClient }>>> }>;

async function loadDemo() {
  const fetcher = (ClientDetailPage({ params: Promise.resolve({ id: TOUR_DEMO_CLIENT_ID }) }) as PageEl).props.children;
  return (await fetcher.type(fetcher.props)).props.client;
}

describe("tour demo client", () => {
  it.each(sessions)("renders for $user.role without touching the database", async (session) => {
    const rowsBefore = db.select().from(clients).where(eq(clients.id, TOUR_DEMO_CLIENT_ID)).all().length;
    vi.mocked(getServerSession).mockResolvedValue(session);

    const client = await loadDemo();
    expect(client.id).toBe(TOUR_DEMO_CLIENT_ID);
    expect(client.employeeId).toBe(session.user.id);
    expect(client.onEmailList).toBe(false);
    expect(db.select().from(clients).where(eq(clients.id, TOUR_DEMO_CLIENT_ID)).all()).toHaveLength(rowsBefore);
  });
});
