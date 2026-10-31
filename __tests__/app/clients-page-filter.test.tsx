import { vi, describe, it, expect, beforeEach } from "vitest";
import type { ReactElement } from "react";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queries")>()),
  getClientsWithEmployeePaginated: vi.fn(async () => ({ rows: [], total: 0, page: 1 })),
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { getClientsWithEmployeePaginated } from "@/lib/queries";
import ClientListPage from "@/app/(app)/clients/page";

const managerSession: Session = {
  user: { id: "2d7a352d-53a0-4544-b515-902e7dd59206", name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

type PageEl = ReactElement<{ children: ReactElement<Record<string, unknown>, (p: Record<string, unknown>) => Promise<ReactElement<{ currentFilters: { filter?: string } }>>> }>;

/** The page is `<Suspense><Fetcher …/></Suspense>`; run the loader directly. */
function runLoader(sp: Record<string, string>) {
  const fetcher = (ClientListPage({ searchParams: Promise.resolve(sp) }) as PageEl).props.children;
  return fetcher.type(fetcher.props);
}

describe("clients page ?filter=", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    vi.mocked(getClientsWithEmployeePaginated).mockClear();
  });

  // Regression: the dashboard's Hot Leads card links to /clients?filter=hot,
  // but the page never read `filter`, so the link showed the whole book.
  it("passes a whitelisted quick filter through to the query and the list", async () => {
    const el = await runLoader({ filter: "hot" });
    expect(getClientsWithEmployeePaginated).toHaveBeenCalledWith(undefined, expect.objectContaining({ filter: "hot" }));
    expect(el.props.currentFilters.filter).toBe("hot");
  });

  it("drops an unknown filter value", async () => {
    const el = await runLoader({ filter: "'; DROP TABLE clients; --" });
    expect(getClientsWithEmployeePaginated).toHaveBeenCalledWith(undefined, expect.objectContaining({ filter: undefined }));
    expect(el.props.currentFilters.filter).toBeUndefined();
  });
});
