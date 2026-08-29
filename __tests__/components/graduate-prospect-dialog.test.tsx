/**
 * Regression: the graduate dialog collected birthday/anniversary as free-text
 * "MM/DD" inputs, so junk reached clients.birthday/anniversary and dropped the
 * graduated client out of the month buckets (substr(col, 6, 2)). It now uses
 * the same DatePicker as the client form and submits canonical "YYYY-MM-DD".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GraduateProspectDialog } from "@/components/graduate-prospect-dialog";
import type { ProspectListRow } from "@/lib/queries";

const graduateProspect = vi.fn();

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/actions", () => ({
  graduateProspect: (...args: unknown[]) => graduateProspect(...args),
  graduateProspectIntoExistingClient: vi.fn(),
}));

// Radix Select needs pointer APIs jsdom lacks; the dialog only needs a way to
// set preferredContact, so stand it in with a plain button.
vi.mock("@/components/ui/select", () => ({
  Select: ({ onValueChange }: { onValueChange: (v: string) => void }) => (
    <button onClick={() => onValueChange("call")}>pick-call</button>
  ),
  SelectTrigger: () => null,
  SelectContent: () => null,
  SelectItem: () => null,
  SelectValue: () => null,
}));

vi.mock("@/components/products-of-interest-input", () => ({
  ProductsOfInterestInput: () => null,
}));

vi.mock("@/components/use-catalog", () => ({
  useCatalog: () => ({ catalogIndex: null, isManager: false }),
}));

const prospect = {
  id: "p1",
  rvxCustomerId: "C1",
  rvxStoreId: null,
  rvxSpend: null,
  firstName: "Dana",
  lastName: "Ashford",
  phone: null,
  email: null,
  status: "active",
  productsOfInterest: [],
  notes: null,
  // Two shapes in the wild: canonical calendar date and a legacy ISO timestamp.
  birthday: "1988-04-12",
  anniversary: "2015-09-03T07:00:00.000Z",
  importBatchId: "b1",
  createdAt: new Date(),
} as unknown as ProspectListRow;

function renderDialog() {
  return render(
    <GraduateProspectDialog prospect={prospect} open onOpenChangeAction={vi.fn()} />,
  );
}

describe("GraduateProspectDialog — occasion dates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    graduateProspect.mockResolvedValue({ type: "created", clientId: "c1" });
  });

  it("renders date pickers, not free-text MM/DD inputs", () => {
    renderDialog();
    expect(screen.queryByPlaceholderText("MM/DD")).toBeNull();
    expect(screen.queryByLabelText("Birthday")).toBeNull();
    expect(screen.getAllByRole("button", { name: /\w{3} \d{1,2}, \d{4}/ })).toHaveLength(2);
  });

  it("pre-fills both pickers from the prospect row, whatever the stored shape", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Apr 12, 1988" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sep 3, 2015" })).toBeInTheDocument();
  });

  it("submits canonical calendar dates to the action", async () => {
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "pick-call" }));
    await userEvent.click(screen.getByRole("button", { name: /Graduate/ }));

    await waitFor(() => expect(graduateProspect).toHaveBeenCalledTimes(1));
    expect(graduateProspect).toHaveBeenCalledWith(
      expect.objectContaining({
        prospectId: "p1",
        birthday: "1988-04-12",
        anniversary: "2015-09-03",
      }),
    );
  });
});
