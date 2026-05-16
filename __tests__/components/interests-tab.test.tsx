import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InterestsTab } from "@/components/interests-tab";
import type { FullClient } from "@/components/client-provider";

// Mock outreach-logger since it has complex dialog dependencies
vi.mock("@/components/outreach-logger", () => ({
  OutreachLogger: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

function makeClient(overrides: Partial<FullClient> = {}): FullClient {
  return {
    id: "client-1",
    firstName: "John",
    lastName: "Doe",
    dateAdded: "2025-01-01",
    productsOfInterest: [],
    onEmailList: false,
    status: "active",
    source: "Walk-in",
    notes: null,
    tags: [],
    heatScore: 0,
    heatLevel: "cold",
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
    outreach: [],
    timeline: [],
    matches: [],
    allTags: [],
    followUps: [],
    ...overrides,
  };
}

const clientWithInterests = makeClient({
  id: "client-1",
  firstName: "John",
  lastName: "Doe",
  productsOfInterest: [
    { model: "KX1023-01X", collection: "Solaris", intent: "promo" },
    { model: null, collection: "Sentinel Diver", intent: "arrival" },
    { model: "NR-710-12L", collection: null, intent: "interested" },
  ],
  matches: [
    {
      match: { id: "m1", clientId: "client-1", promoId: "p1", matchType: "model", createdAt: new Date() },
      promo: { id: "p1", modelNumber: "KX1023-01X", collection: "Eco", msrp: null, discountPercent: null, discountPrice: null, promoStart: null, promoEnd: null, dateAdded: new Date() },
    },
    {
      match: { id: "m2", clientId: "client-1", promoId: "p2", matchType: "collection", createdAt: new Date() },
      promo: { id: "p2", modelNumber: "NR-710", collection: "Sentinel", msrp: null, discountPercent: null, discountPrice: null, promoStart: null, promoEnd: null, dateAdded: new Date() },
    },
  ],
});

const clientWithNoInterests = makeClient({
  id: "client-2",
  firstName: "Jane",
  lastName: "Smith",
  productsOfInterest: [],
  matches: [],
});

describe("InterestsTab (unified table)", () => {
  it("renders the Products of Interest table with one row per entry", () => {
    render(<InterestsTab client={clientWithInterests} />);
    expect(screen.getAllByText("Products of Interest").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("KX1023-01X")).toBeInTheDocument();
    expect(screen.getByText("NR-710-12L")).toBeInTheDocument();
    expect(screen.getByText("Solaris")).toBeInTheDocument();
    expect(screen.getByText("Sentinel Diver")).toBeInTheDocument();
  });

  it("shows intent badges for each entry", () => {
    render(<InterestsTab client={clientWithInterests} />);
    // "Promo" is also a column header, so there are ≥2; the badge adds one.
    expect(screen.getAllByText("Promo").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Arrival")).toBeInTheDocument();
    expect(screen.getByText("Interested")).toBeInTheDocument();
  });

  it("derives a promo badge for the model-matched entry", () => {
    render(<InterestsTab client={clientWithInterests} />);
    // m1 matches KX1023-01X by model → promo cell shows a model badge
    expect(screen.getByText(/· model/)).toBeInTheDocument();
  });

  it("shows the empty state when there are no interests", () => {
    render(<InterestsTab client={clientWithNoInterests} />);
    expect(screen.getByText("No products of interest recorded")).toBeInTheDocument();
  });

  it("filters rows by intent via the funnel", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithInterests} />);
    expect(screen.getByText("KX1023-01X")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Filter intent"));
    await user.click(screen.getByLabelText("Arrival"));
    // Arrival-only: the promo/interested model rows drop out
    expect(screen.queryByText("KX1023-01X")).not.toBeInTheDocument();
    expect(screen.getByText("Sentinel Diver")).toBeInTheDocument();
  });

  it("sorts when a column header is clicked", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithInterests} />);
    // Toggling sort should not throw and keeps rows rendered
    await user.click(screen.getByText("Model"));
    expect(screen.getByText("NR-710-12L")).toBeInTheDocument();
  });
});
