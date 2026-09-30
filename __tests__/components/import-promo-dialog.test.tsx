/**
 * Regression: closing the dialog while a PDF parse was still running let the
 * result land after handleReset, so the next open showed the old file's rows.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportPromoDialog } from "@/components/promo/import-promo-dialog";
import type { ParsedPromoPdf } from "@/lib/promo-pdf-parser";
import type { ResolvedPromoRow } from "@/lib/actions/promos";

const parsePromoPdf = vi.fn();
const resolvePromoRows = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/promo-pdf-parser", () => ({
  parsePromoPdf: (...args: unknown[]) => parsePromoPdf(...args),
}));
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

const parsed: ParsedPromoPdf = {
  rows: [{ modelNumber: "MER-100", collection: "Solaris", msrp: 400, discountPercent: 30, discountPrice: 280, sizeOneQty: 0, sizeTwoQty: 0 }],
  brand: "Meridian",
  promoStart: null,
  promoEnd: null,
  pageCount: 1,
  pagesWithoutDiscount: [],
};

const resolved: ResolvedPromoRow[] = [{
  modelNumber: "MER-100",
  pdfCollection: "Solaris",
  pdfMsrp: 400,
  discountPercent: 30,
  discountPrice: 280,
  catalogBrand: "Meridian",
  catalogCollection: "Solaris",
  catalogMsrp: 400,
  effectiveBrand: "Meridian",
  effectiveCollection: "Solaris",
  effectiveMsrp: 400,
  isUncatalogued: false,
  collectionMismatch: false,
  msrpLow: false,
} as ResolvedPromoRow];

describe("ImportPromoDialog", () => {
  it("discards a parse result that lands after the dialog was closed", async () => {
    let finishParse!: (v: ParsedPromoPdf) => void;
    parsePromoPdf.mockReturnValue(new Promise<ParsedPromoPdf>((r) => { finishParse = r; }));
    resolvePromoRows.mockResolvedValue({ resolved });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(<ImportPromoDialog open onOpenChangeAction={onOpenChange} />);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File(["%PDF"], "meridian-old.pdf", { type: "application/pdf" }));
    expect(screen.getByRole("button", { name: /parsing pdf/i })).toBeDisabled();

    // Close mid-parse (Escape → onOpenChange(false) → reset), then let it finish.
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(<ImportPromoDialog open={false} onOpenChangeAction={onOpenChange} />);
    await act(async () => { finishParse(parsed); });

    rerender(<ImportPromoDialog open onOpenChangeAction={onOpenChange} />);
    expect(screen.getByRole("button", { name: /choose pdf/i })).toBeEnabled();
    expect(screen.queryByText("meridian-old.pdf")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /import 1 promo/i })).not.toBeInTheDocument();
    expect(resolvePromoRows).not.toHaveBeenCalled();
  });

  it("still shows a result that lands while the dialog stays open", async () => {
    parsePromoPdf.mockResolvedValue(parsed);
    resolvePromoRows.mockResolvedValue({ resolved });
    const user = userEvent.setup();

    render(<ImportPromoDialog open onOpenChangeAction={vi.fn()} />);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File(["%PDF"], "meridian.pdf", { type: "application/pdf" }));

    expect(await screen.findByRole("button", { name: /import 1 promo/i })).toBeInTheDocument();
  });
});
