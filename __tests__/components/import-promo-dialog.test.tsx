/**
 * Regression: closing the dialog while rows were still resolving let the
 * result land after handleReset, so the next open showed the old rows.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportPromoDialog } from "@/components/promo/import-promo-dialog";
import type { ResolvedPromoRow } from "@/lib/actions/promos";
import { BrandsProvider } from "@/components/brands-provider";
import { SAMPLE_BRANDS } from "@/lib/db/schema";

// The sample brand list, as the app layout's BrandsProvider would supply it.
const BrandsWrapper = ({ children }: { children: React.ReactNode }) => <BrandsProvider brands={SAMPLE_BRANDS}>{children}</BrandsProvider>;


const resolvePromoRows = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/actions/promos", () => ({
  importPromos: vi.fn(),
  resolvePromoRows: (...args: unknown[]) => resolvePromoRows(...args),
}));

beforeAll(() => {
  // The dialog's ScrollArea observes its size; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const resolved: ResolvedPromoRow[] = [{
  rowKey: "#1",
  modelNumber: "MER-100",
  fileCollection: "Sundrift",
  fileMsrp: 400,
  discountPercent: 30,
  discountPrice: 280,
  catalogBrand: "Maravista",
  catalogCollection: "Sundrift",
  catalogMsrp: 400,
  effectiveBrand: "Maravista",
  effectiveCollection: "Sundrift",
  effectiveMsrp: 400,
  isUncatalogued: false,
  collectionMismatch: false,
  msrpLow: false,
  priceIssues: [],
  suggestion: { brand: null, source: null, reason: null, conflict: [] },
  sheetBrandMismatch: null,
}];

const ROW = "Maravista,Sundrift,MER-100,400,280,30";

describe("ImportPromoDialog", () => {
  beforeEach(() => resolvePromoRows.mockReset());

  it("shows the A–F column order", () => {
    render(<ImportPromoDialog open onOpenChangeAction={vi.fn()} />, { wrapper: BrandsWrapper });
    for (const c of ["Brand", "Collection", "Model", "MSRP", "Sale price", "Discount %"]) {
      expect(screen.getByText(c)).toBeInTheDocument();
    }
  });

  it("parses pasted rows and resolves them against the catalog", async () => {
    resolvePromoRows.mockResolvedValue({ resolved });
    const user = userEvent.setup();
    render(<ImportPromoDialog open onOpenChangeAction={vi.fn()} />, { wrapper: BrandsWrapper });

    await user.type(screen.getByLabelText("Paste from a spreadsheet"), ROW);
    await user.click(screen.getByRole("button", { name: "Analyze" }));

    expect(resolvePromoRows).toHaveBeenCalledWith([
      { modelNumber: "MER-100", collection: "Sundrift", brand: "Maravista", brandText: "Maravista", msrp: 400, discountPrice: 280, discountPercent: 30, sourceRow: 1, warnings: [] },
    ], { extraBrands: [] });
    expect(await screen.findByRole("button", { name: /import 1 promo/i })).toBeInTheDocument();
  });

  it("discards a resolve result that lands after the dialog was closed", async () => {
    let finish!: (v: { resolved: ResolvedPromoRow[] }) => void;
    resolvePromoRows.mockReturnValue(new Promise((r) => { finish = r; }));
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(<ImportPromoDialog open onOpenChangeAction={onOpenChange} />, { wrapper: BrandsWrapper });
    await user.type(screen.getByLabelText("Paste from a spreadsheet"), ROW);
    await user.click(screen.getByRole("button", { name: "Analyze" }));

    // Close mid-resolve (Escape → onOpenChange(false) → reset), then let it finish.
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(<ImportPromoDialog open={false} onOpenChangeAction={onOpenChange} />);
    await act(async () => { finish({ resolved }); });

    rerender(<ImportPromoDialog open onOpenChangeAction={onOpenChange} />);
    expect(screen.getByLabelText("Paste from a spreadsheet")).toHaveValue("");
    expect(screen.queryByRole("button", { name: /import 1 promo/i })).not.toBeInTheDocument();
  });
});
