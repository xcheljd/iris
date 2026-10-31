import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MatchedClientsTab } from "@/components/matched-clients-tab";
import type { MatchedClientRow } from "@/lib/queries";

const jane = {
  clientId: "c1", clientFirstName: "Jane", clientLastName: "Doe",
  clientEmployeeId: "assoc-1", ownerName: "Cameron R", preferredContact: "text",
  phone: "555-1111", email: "jane@x.com", promoStart: null, promoEnd: null,
};
const rows: MatchedClientRow[] = [
  { ...jane, promoModel: "MV-2102-BLK", promoCollection: "CANYON", promoBrand: "Maravista", msrp: 400, discountPrice: 300, discountPercent: 25, matchType: "model" },
  { ...jane, promoModel: "MV-2110-GLD", promoCollection: "SUNDRIFT", promoBrand: "Maravista", msrp: 500, discountPrice: 450, discountPercent: 10, matchType: "model" },
  {
    clientId: "c2", clientFirstName: "Bob", clientLastName: "Lee",
    clientEmployeeId: "assoc-2", ownerName: "Jordan K", preferredContact: "email",
    phone: "555-2222", email: "bob@x.com", promoModel: "AD-8404",
    promoCollection: "DRIFTWOOD", promoBrand: "Aldermoor", msrp: 500, discountPrice: 400, discountPercent: 20,
    matchType: "collection", promoStart: "2099-01-05", promoEnd: "2099-01-11",
  },
];

describe("MatchedClientsTab", () => {
  it("lists one row per client, closed, with contact, wants and best price", () => {
    render(<MatchedClientsTab clients={rows} isManager currentUserId="mgr" />);
    expect(screen.getByText("2 clients · 3 items")).toBeInTheDocument();
    expect(screen.getAllByText("Jane Doe")).toHaveLength(1);
    expect(screen.getByText("Cameron R")).toBeInTheDocument();
    expect(screen.getByText("555-1111")).toBeInTheDocument(); // prefers text → phone
    expect(screen.getByText("bob@x.com")).toBeInTheDocument(); // prefers email
    // Shown in the Wants column, and under the name on phones (CSS hides one).
    expect(screen.getAllByText("2 items")).toHaveLength(2);
    expect(screen.getByText("MV-2102-BLK, MV-2110-GLD")).toBeInTheDocument();
    expect(screen.getByText("DRIFTWOOD collection")).toBeInTheDocument();
    // Jane's best deal is the 25% item.
    expect(screen.getByText("$300.00")).toBeInTheDocument();
    expect(screen.getByText("25% off")).toBeInTheDocument();
    // Closed: the per-item details aren't shown yet.
    expect(screen.queryByText(/^Starts /)).not.toBeInTheDocument();
  });

  it("opens a client to show each item, and Expand all opens every row", async () => {
    const user = userEvent.setup();
    render(<MatchedClientsTab clients={rows} isManager currentUserId="mgr" />);
    const [janeToggle] = screen.getAllByRole("button", { name: "Show item details" });
    await user.click(janeToggle);
    expect(screen.getByRole("button", { name: "Hide item details" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("MV-2102-BLK")).toHaveLength(2); // desktop + phone copy
    expect(screen.getAllByText("SUNDRIFT · Maravista")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getAllByText("Starts Mon, Jan 5")).toHaveLength(2);
    expect(screen.getAllByText("via DRIFTWOOD collection")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.queryByText("Starts Mon, Jan 5")).not.toBeInTheDocument();
  });

  it("lists an opened client's items biggest discount first", async () => {
    const user = userEvent.setup();
    const reversed = [rows[1], rows[0]]; // 10% item arrives before the 25% one
    render(<MatchedClientsTab clients={reversed} isManager currentUserId="mgr" />);
    await user.click(screen.getByRole("button", { name: "Show item details" }));
    const order = screen.getAllByText(/^MV-21(02-BLK|10-GLD)$/).map((e) => e.textContent);
    expect(order.filter((_, i) => i % 2 === 0)).toEqual(["MV-2102-BLK", "MV-2110-GLD"]);
  });

  it("manager gets client links; associate only for own clients", () => {
    const { rerender } = render(<MatchedClientsTab clients={rows} isManager currentUserId="mgr" />);
    expect(screen.getByRole("link", { name: "Jane Doe" })).toHaveAttribute("href", "/clients/c1?from=promo-matches");
    rerender(<MatchedClientsTab clients={rows} isManager={false} currentUserId="assoc-1" />);
    // Owns c1 → link; does not own c2 → plain text
    expect(screen.getByRole("link", { name: "Jane Doe" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Bob Lee" })).not.toBeInTheDocument();
    expect(screen.getByText("Bob Lee")).toBeInTheDocument();
  });

  it("filters by match type: a client shows with just the items left", async () => {
    const user = userEvent.setup();
    render(<MatchedClientsTab clients={rows} isManager currentUserId="mgr" />);
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByLabelText("collection"));
    expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
    expect(screen.getByText("Bob Lee")).toBeInTheDocument();
    expect(screen.getByText("1 client · 1 item")).toBeInTheDocument();
  });

  // Regression: Facet was a component created during render, so every toggle
  // remounted the facet and the clicked checkbox lost focus.
  it("keeps the same focused checkbox after toggling a facet", async () => {
    const user = userEvent.setup();
    render(<MatchedClientsTab clients={rows} isManager currentUserId="mgr" />);
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    const checkbox = screen.getByLabelText("model");
    await user.click(checkbox);
    expect(screen.getByLabelText("model")).toBe(checkbox);
    expect(checkbox).toHaveFocus();
  });

  it("searches clients, models and collections", async () => {
    const user = userEvent.setup();
    render(<MatchedClientsTab clients={rows} isManager currentUserId="mgr" />);
    await user.type(screen.getByLabelText("Search matched clients"), "sundrift");
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.queryByText("Bob Lee")).not.toBeInTheDocument();
    expect(screen.getByText("1 client · 1 item")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Search matched clients"));
    await user.type(screen.getByLabelText("Search matched clients"), "nobody");
    expect(screen.getByText("No matches fit these filters")).toBeInTheDocument();
  });

  it("sorts by best deal", async () => {
    const user = userEvent.setup();
    render(<MatchedClientsTab clients={rows} isManager currentUserId="mgr" />);
    await user.click(screen.getByRole("button", { name: /Best deal/ }));
    const names = screen.getAllByRole("link").map((a) => a.textContent);
    expect(names).toEqual(["Bob Lee", "Jane Doe"]); // 20% before 25%
  });

  it("warns when the server truncated the match list, and only then", () => {
    const { rerender } = render(<MatchedClientsTab clients={rows} isManager currentUserId="mgr" />);
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();
    rerender(<MatchedClientsTab clients={rows} truncated isManager currentUserId="mgr" />);
    expect(screen.getByText(/Showing the first 1,000 matches/)).toBeInTheDocument();
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

  it("pages by client, not by item", () => {
    const many: MatchedClientRow[] = Array.from({ length: 16 }, (_, i) => [0, 1].map((k) => ({
      ...rows[0], clientId: `p${i}`, clientFirstName: `Person${String(i).padStart(2, "0")}`, promoModel: `M${i}-${k}`,
    }))).flat();
    render(<MatchedClientsTab clients={many} isManager currentUserId="mgr" />);
    const body = screen.getAllByRole("rowgroup")[1];
    expect(within(body).getAllByRole("button", { name: "Show item details" })).toHaveLength(15);
  });
});
