import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InterestsTab } from "@/components/interests-tab";
import type { FullClient } from "@/components/client-provider";
import { saveClientEdits } from "@/lib/actions";
import { normalizeModel } from "@/lib/normalize";
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

  // The bar's submit button is named exactly "Add"; the composite input's
  // icon-only add button is named "Add interest", so an exact-name query stays
  // unambiguous once the dialog is open.
  const barAddButton = () => screen.getByRole("button", { name: "Add" });

  // Type a token into the quick-add bar and submit it. Returns the dialog's
  // pre-seeded model input.
  async function openAddDialog(user: ReturnType<typeof userEvent.setup>, token: string) {
    await user.type(screen.getByLabelText("Add an interest"), token);
    await user.click(barAddButton());
    return screen.findByLabelText("Model number");
  }

  // Drive the shared ProductsOfInterestInput inside the dialog: the model field
  // arrives pre-seeded (and normalized) with the bar's token and the intent
  // already defaults to "interested", so Enter alone commits it.
  async function addInterest(user: ReturnType<typeof userEvent.setup>, model: string) {
    const modelInput = await openAddDialog(user, model);
    expect(modelInput).toHaveValue(normalizeModel(model));
    await user.click(modelInput);
    await user.keyboard("{Enter}");
    return modelInput;
  }

  it("opens the composite add dialog pre-seeded from the quick-add bar", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithNoInterests} />);

    // Dialog not open initially: the composite input isn't in the document.
    expect(screen.queryByLabelText("Model number")).not.toBeInTheDocument();
    await addInterest(user, "vs-8840");

    expect(saveClientEdits).toHaveBeenCalledWith("client-2", {
      productsOfInterest: [{ model: "VS-8840", collection: null, brand: null, intent: "interested" }],
    });
    // Optimistic row replaces the empty state before the refresh lands.
    expect(await screen.findByText("VS-8840")).toBeInTheDocument();
  });

  it("commits with Enter without touching the intent toggle", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithNoInterests} />);

    const modelInput = await openAddDialog(user, "vs-8840");
    // F11: a seeded model defaults the intent, so Enter is not a dead key.
    expect(screen.getByRole("radio", { name: "Interested" })).toBeChecked();
    await user.click(modelInput);
    await user.keyboard("{Enter}");

    expect(saveClientEdits).toHaveBeenCalledWith("client-2", {
      productsOfInterest: [{ model: "VS-8840", collection: null, brand: null, intent: "interested" }],
    });
  });

  it("blocks a duplicate client-side without calling the action", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithInterests} />);

    await addInterest(user, "kx1023-01x");

    expect(screen.getByRole("alert")).toHaveTextContent("This client already has that interest");
    expect(saveClientEdits).not.toHaveBeenCalled();
  });

  it("renders the rejection message inside the open dialog", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithInterests} />);

    await addInterest(user, "kx1023-01x");

    // Regression: the alert used to live in the quick-add bar, behind the
    // modal overlay, so the user never saw why nothing happened.
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "This client already has that interest",
    );
  });

  it("keeps the typed fields when the add is rejected", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithInterests} />);

    const modelInput = await addInterest(user, "kx1023-01x");

    // F4: a rejected add must not clear the draft — the user has to be able to
    // correct the model rather than retype it.
    expect(modelInput).toHaveValue("KX1023-01X");
    expect(screen.getByRole("radio", { name: "Interested" })).toBeChecked();
  });

  it("reports a same model+collection add that only differs by intent", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithInterests} />);

    // KX1023-01X / Solaris is already tracked with intent "promo". The server
    // dedupe rule ignores intent, so this add is a no-op — say so out loud
    // instead of silently swallowing it.
    const modelInput = await openAddDialog(user, "kx1023-01x");
    await user.type(screen.getByLabelText("Collection"), "Solaris");
    await user.click(modelInput);
    await user.keyboard("{Enter}");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "That interest is already tracked — change it from Edit Client.",
    );
    expect(saveClientEdits).not.toHaveBeenCalled();
  });

  it("does not open the dialog from an empty quick-add bar", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithNoInterests} />);

    await user.click(barAddButton());
    expect(screen.queryByLabelText("Model number")).not.toBeInTheDocument();
    expect(saveClientEdits).not.toHaveBeenCalled();
  });

  it("does not open the dialog from a whitespace-only quick-add bar", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithNoInterests} />);

    await user.type(screen.getByLabelText("Add an interest"), "   ");
    await user.click(barAddButton());
    expect(screen.queryByLabelText("Model number")).not.toBeInTheDocument();
    expect(saveClientEdits).not.toHaveBeenCalled();
  });

  it("closes the dialog on Done", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithNoInterests} />);

    await openAddDialog(user, "vs-8840");
    await user.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("re-seeds with the new token when the dialog is reopened after an add", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithNoInterests} />);

    await addInterest(user, "vs-8840");
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(await openAddDialog(user, "nr-710-12l")).toHaveValue("NR-710-12L");
  });

  it("does not carry a stale seed when the dialog is closed without adding", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithNoInterests} />);

    await openAddDialog(user, "vs-8840");
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Closing clears the bar, so the next open seeds from the new token only.
    expect(screen.getByLabelText("Add an interest")).toHaveValue("");
    expect(await openAddDialog(user, "nr-710-12l")).toHaveValue("NR-710-12L");
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
