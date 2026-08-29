import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InterestsTab } from "@/components/interests-tab";
import type { FullClient } from "@/components/client-provider";
import { saveClientEdits } from "@/lib/actions";

// Mock outreach-logger since it has complex dialog dependencies
vi.mock("@/components/outreach-logger", () => ({
  OutreachLogger: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/actions", () => ({ saveClientEdits: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
    { model: "KX1023-01X", collection: "Solaris", brand: null, intent: "promo" },
    { model: null, collection: "Sentinel Diver", brand: null, intent: "arrival" },
    { model: "NR-710-12L", collection: null, brand: null, intent: "interested" },
  ],
  matches: [
    {
      match: { id: "m1", clientId: "client-1", promoId: "p1", matchType: "model", createdAt: new Date() },
      promo: { id: "p1", modelNumber: "KX1023-01X", collection: "Eco", brand: "Meridian", sizeOneQty: 0, sizeTwoQty: 0, msrp: null, discountPercent: null, discountPrice: null, promoStart: null, promoEnd: null, dateAdded: new Date() },
    },
    {
      match: { id: "m2", clientId: "client-1", promoId: "p2", matchType: "collection", createdAt: new Date() },
      promo: { id: "p2", modelNumber: "NR-710", collection: "Sentinel", brand: "Meridian", sizeOneQty: 0, sizeTwoQty: 0, msrp: null, discountPercent: null, discountPrice: null, promoStart: null, promoEnd: null, dateAdded: new Date() },
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
    await user.click(screen.getByLabelText("Filter Intent"));
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

describe("InterestsTab quick add", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.mocked(saveClientEdits).mockReset();
    vi.mocked(saveClientEdits).mockResolvedValue(undefined);
  });

  it("saves the new interest and shows the row immediately", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithNoInterests} />);

    await user.type(screen.getByLabelText("Add an interest"), "vs-8840");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(saveClientEdits).toHaveBeenCalledWith("client-2", {
      productsOfInterest: [{ model: "VS-8840", collection: null, brand: null, intent: "interested" }],
    });
    // Optimistic row replaces the empty state before the refresh lands.
    expect(await screen.findByText("VS-8840")).toBeInTheDocument();
    expect(screen.getByLabelText("Add an interest")).toHaveValue("");
  });

  it("blocks a duplicate client-side without calling the action", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithInterests} />);

    await user.type(screen.getByLabelText("Add an interest"), "kx1023-01x");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("alert")).toHaveTextContent("This client already has that interest");
    expect(saveClientEdits).not.toHaveBeenCalled();
  });

  it("rejects an empty entry", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithNoInterests} />);

    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(saveClientEdits).not.toHaveBeenCalled();
  });

  it("rolls the optimistic row back when the server rejects it", async () => {
    const user = userEvent.setup();
    vi.mocked(saveClientEdits).mockResolvedValue({ error: "Not authorized" });
    render(<InterestsTab client={clientWithNoInterests} />);

    await user.type(screen.getByLabelText("Add an interest"), "vs-8840");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("No products of interest recorded")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
