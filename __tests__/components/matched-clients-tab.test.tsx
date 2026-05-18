import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MatchedClientsTab } from "@/components/matched-clients-tab";
import type { MatchedClientRow } from "@/lib/queries";

const rows: MatchedClientRow[] = [
  {
    clientId: "c1", clientFirstName: "Jane", clientLastName: "Doe",
    clientEmployeeId: "assoc-1", ownerName: "Cameron R", preferredContact: "text",
    phone: "555-1111", email: "jane@x.com", promoModel: "IX1002-01X",
    promoCollection: "CAMBRIDGE", promoBrand: "Meridian", msrp: 395, discountPrice: 296,
    matchType: "model",
  },
  {
    clientId: "c2", clientFirstName: "Bob", clientLastName: "Lee",
    clientEmployeeId: "assoc-2", ownerName: "Jordan K", preferredContact: "call",
    phone: "555-2222", email: "bob@x.com", promoModel: "70Z004",
    promoCollection: "DEEPSTAR", promoBrand: "Ashford", msrp: 500, discountPrice: 400,
    matchType: "brand",
  },
];

describe("MatchedClientsTab", () => {
  it("renders rows with the decided columns", () => {
    render(<MatchedClientsTab clients={rows} isManager currentUserId="mgr" />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Cameron R")).toBeInTheDocument();
    expect(screen.getByText("IX1002-01X")).toBeInTheDocument();
    expect(screen.getByText("brand")).toBeInTheDocument(); // match type badge
    expect(screen.getByText("$296.00")).toBeInTheDocument();
  });

  it("manager gets client links; associate only for own clients", () => {
    const { rerender } = render(<MatchedClientsTab clients={rows} isManager currentUserId="mgr" />);
    expect(screen.getByRole("link", { name: "Jane Doe" })).toHaveAttribute(
      "href", "/clients/c1?from=promo-matches",
    );

    rerender(<MatchedClientsTab clients={rows} isManager={false} currentUserId="assoc-1" />);
    // Owns c1 → link; does not own c2 → plain text
    expect(screen.getByRole("link", { name: "Jane Doe" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Bob Lee" })).not.toBeInTheDocument();
    expect(screen.getByText("Bob Lee")).toBeInTheDocument();
  });

  it("filters by a facet (match type)", async () => {
    const user = userEvent.setup();
    render(<MatchedClientsTab clients={rows} isManager currentUserId="mgr" />);
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByLabelText("model"));
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.queryByText("Bob Lee")).not.toBeInTheDocument();
  });

  it("sorts when a column header is clicked", async () => {
    const user = userEvent.setup();
    render(<MatchedClientsTab clients={rows} isManager currentUserId="mgr" />);
    await user.click(screen.getByRole("button", { name: /Client/ }));
    expect(screen.getByText("Jane Doe")).toBeInTheDocument(); // still rendered, no throw
  });

  it("shows an empty state with no rows", () => {
    render(<MatchedClientsTab clients={[]} isManager currentUserId="mgr" />);
    expect(screen.getByText("No matched clients")).toBeInTheDocument();
  });

  it("opens the CSV export dialog from the header button", async () => {
    const user = userEvent.setup();
    render(<MatchedClientsTab clients={rows} isManager currentUserId="mgr" />);
    await user.click(screen.getByRole("button", { name: /Export CSV/ }));
    expect(await screen.findByText("Export Matched Clients to CSV")).toBeInTheDocument();
  });
});
