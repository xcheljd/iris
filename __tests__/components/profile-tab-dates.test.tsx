/**
 * Occasion-date rendering, with the real date-fns (tab-components.test.tsx
 * stubs `format` wholesale, so it cannot assert on formatted output).
 *
 * Regression: birthday/anniversary are day-precision TEXT columns holding two
 * shapes — the canonical "YYYY-MM-DD" and a full ISO timestamp left by form
 * submits that JSON-serialised a Date. Both must render as a plain calendar
 * day: no raw timestamp, and no UTC-midnight off-by-one.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProfileTab } from "@/components/profile-tab";
import type { FullClient } from "@/components/client-provider";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const client: FullClient = {
  id: "c1",
  firstName: "Bea",
  lastName: "Voss",
  phone: null,
  email: null,
  employeeId: "e1",
  employeeName: "Marcus",
  customerId: null,
  dateAdded: "2026-01-01T00:00:00Z",
  productsOfInterest: [],
  notes: null,
  onEmailList: false,
  status: "active",
  source: "Walk-in",
  birthday: "2000-08-13",
  anniversary: "2026-08-29T07:00:00.000Z",
  tags: [],
  heatScore: 50,
  heatLevel: "warm",
  lastOutreachAt: null,
  lastPurchaseAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  outreach: [],
  timeline: [],
  matches: [],
  allTags: [],
  followUps: [],
};

describe("ProfileTab occasion dates", () => {
  it("renders a canonical YYYY-MM-DD birthday on its own calendar day", () => {
    render(<TooltipProvider><ProfileTab client={client} /></TooltipProvider>);
    expect(screen.getByText("August 13")).toBeInTheDocument();
  });

  it("renders an ISO-timestamp anniversary as a calendar day, not a timestamp", () => {
    render(<TooltipProvider><ProfileTab client={client} /></TooltipProvider>);
    expect(screen.getByText("August 29")).toBeInTheDocument();
    expect(screen.queryByText(/T07:00:00/)).not.toBeInTheDocument();
  });
});
