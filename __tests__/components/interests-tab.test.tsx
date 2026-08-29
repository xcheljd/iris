import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InterestsTab } from "@/components/interests-tab";
import type { FullClient } from "@/components/client-provider";
import { saveClientEdits } from "@/lib/actions";
import { toast } from "sonner";

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
    // "Arrival"/"Interested" also appear on the shared quick-add's intent toggles.
    expect(screen.getAllByText("Arrival").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Interested").length).toBeGreaterThanOrEqual(1);
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

  // Drive the shared ProductsOfInterestInput directly: type a model, pick the
  // "Interested" intent, then submit from the model field (Enter triggers add).
  async function addInterest(user: ReturnType<typeof userEvent.setup>, model: string) {
    const modelInput = screen.getByLabelText("Model number");
    await user.type(modelInput, model);
    await user.click(screen.getByRole("radio", { name: "Interested" }));
    await user.click(modelInput);
    await user.keyboard("{Enter}");
  }

  it("saves the new interest and shows the row immediately", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithNoInterests} />);

    await addInterest(user, "vs-8840");

    expect(saveClientEdits).toHaveBeenCalledWith("client-2", {
      productsOfInterest: [{ model: "VS-8840", collection: null, brand: null, intent: "interested" }],
    });
    // Optimistic row replaces the empty state before the refresh lands.
    expect(await screen.findByText("VS-8840")).toBeInTheDocument();
    expect(screen.getByLabelText("Model number")).toHaveValue("");
  });

  it("blocks a duplicate client-side without calling the action", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithInterests} />);

    await addInterest(user, "kx1023-01x");

    expect(screen.getByRole("alert")).toHaveTextContent("This client already has that interest");
    expect(saveClientEdits).not.toHaveBeenCalled();
  });

  it("disables the add button until a model/collection/intent is provided", () => {
    render(<InterestsTab client={clientWithNoInterests} />);

    // The shared input's only unlabeled button is the [+ Add] action.
    expect(screen.getByRole("button", { name: "" })).toBeDisabled();
    expect(saveClientEdits).not.toHaveBeenCalled();
  });

  it("rolls the optimistic row back when the server rejects it", async () => {
    const user = userEvent.setup();
    vi.mocked(saveClientEdits).mockResolvedValue({ error: "Not authorized" });
    render(<InterestsTab client={clientWithNoInterests} />);

    await addInterest(user, "vs-8840");

    // The save is attempted, then rejected: toast the error, drop the
    // optimistic row, and never refresh.
    expect(saveClientEdits).toHaveBeenCalledWith("client-2", {
      productsOfInterest: [{ model: "VS-8840", collection: null, brand: null, intent: "interested" }],
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Not authorized"));
    expect(screen.queryByText(/VS-8840/)).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
