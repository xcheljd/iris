import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InterestsTab } from "@/components/interests-tab";

// Mock outreach-logger since it has complex dialog dependencies
vi.mock("@/components/outreach-logger", () => ({
  OutreachLogger: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

const clientWithInterests = {
  id: "client-1",
  firstName: "John",
  lastName: "Doe",
  productsOfInterest: [
    "KX1023-01X Meridian Solaris",
    "Sentinel Diver",
    "NR-710-12L",
  ],
  matches: [
    {
      promo: { modelNumber: "KX1023-01X", collection: "Eco" },
      matchType: "model",
    },
    {
      promo: { modelNumber: "NR-710", collection: "Sentinel" },
      matchType: "collection",
    },
  ],
};

const clientWithNoInterests = {
  id: "client-2",
  firstName: "Jane",
  lastName: "Smith",
  productsOfInterest: [],
  matches: [],
};

const clientWithTextOnlyInterests = {
  id: "client-3",
  firstName: "Bob",
  lastName: "Jones",
  productsOfInterest: ["Something without alphanumeric model numbers"],
  matches: [],
};

describe("InterestsTab", () => {
  it("renders all three sub-tab buttons", () => {
    render(<InterestsTab client={clientWithInterests} />);
    // "Models of Interest" appears as both a tab button and a card title
    expect(screen.getAllByText("Models of Interest").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Collections")).toBeInTheDocument();
    expect(screen.getByText("Promo Matches")).toBeInTheDocument();
  });

  it("shows Models tab by default with card content", () => {
    render(<InterestsTab client={clientWithInterests} />);
    // The card title "Models of Interest" should be visible — it appears in both tab button and card heading
    const allModelTexts = screen.getAllByText("Models of Interest");
    expect(allModelTexts.length).toBeGreaterThanOrEqual(2); // tab button + card title
  });

  it("extracts and displays model numbers from products of interest", () => {
    render(<InterestsTab client={clientWithInterests} />);
    // KX1023-01X should be extracted as a model number
    expect(screen.getByText("KX1023-01X")).toBeInTheDocument();
  });

  it("extracts NR-710-12L model number", () => {
    render(<InterestsTab client={clientWithInterests} />);
    expect(screen.getByText("NR-710-12L")).toBeInTheDocument();
  });

  it("switches to Collections tab on click", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithInterests} />);
    const collectionButtons = screen.getAllByText("Collections");
    // Click the tab button (first occurrence)
    await user.click(collectionButtons[0]);
    // Should show Collections card content
    const collectionCardTitles = screen.getAllByText("Collections of Interest");
    expect(collectionCardTitles.length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty state for models when no interests", () => {
    render(<InterestsTab client={clientWithNoInterests} />);
    expect(screen.getByText("No models of interest recorded")).toBeInTheDocument();
  });

  it("shows empty state for collections when no collections extracted", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithNoInterests} />);
    const collectionButtons = screen.getAllByText("Collections");
    await user.click(collectionButtons[0]);
    expect(screen.getByText("No collections of interest recorded")).toBeInTheDocument();
  });

  it("switches to Promo Matches tab and shows match count", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithInterests} />);
    const matchButtons = screen.getAllByText("Promo Matches");
    await user.click(matchButtons[0]);
    expect(screen.getByText("Current Promo Matches")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // 2 promo matches
    expect(screen.getByText("Promos match this client's interests")).toBeInTheDocument();
  });

  it("shows promo match details including model numbers", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithInterests} />);
    const matchButtons = screen.getAllByText("Promo Matches");
    await user.click(matchButtons[0]);
    expect(screen.getByText("KX1023-01X")).toBeInTheDocument();
    expect(screen.getByText("NR-710")).toBeInTheDocument();
  });

  it("shows match type badges for promo matches", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithInterests} />);
    const matchButtons = screen.getAllByText("Promo Matches");
    await user.click(matchButtons[0]);
    expect(screen.getByText("model")).toBeInTheDocument();
    expect(screen.getByText("collection")).toBeInTheDocument();
  });

  it("shows empty promo matches for client with no matches", async () => {
    const user = userEvent.setup();
    render(<InterestsTab client={clientWithNoInterests} />);
    const matchButtons = screen.getAllByText("Promo Matches");
    await user.click(matchButtons[0]);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
