import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductsOfInterestInput } from "@/components/products-of-interest-input";
import type { ProductOfInterest } from "@/lib/db/schema";

const modelField = () => screen.getByLabelText("Model number") as HTMLInputElement;
const addButton = () => screen.getByRole("button", { name: "Add interest" });

const TRACKED: ProductOfInterest[] = [
  { model: "KX1023-01X", collection: "Solaris", brand: null, intent: "promo" },
];

describe("ProductsOfInterestInput seeding contract", () => {
  it("normalizes initialModel at mount", () => {
    render(
      <ProductsOfInterestInput value={[]} onChangeAction={vi.fn()} initialModel="vs-8840" />,
    );
    expect(modelField()).toHaveValue("VS-8840");
  });

  it("defaults the intent to Interested when seeded, and leaves it unset otherwise", () => {
    const { unmount } = render(
      <ProductsOfInterestInput value={[]} onChangeAction={vi.fn()} initialModel="vs-8840" />,
    );
    expect(screen.getByRole("radio", { name: "Interested" })).toBeChecked();
    // A seeded model means the add is already intended, so the add button is
    // live immediately rather than waiting on a toggle click.
    expect(addButton()).toBeEnabled();
    unmount();

    render(<ProductsOfInterestInput value={[]} onChangeAction={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Interested" })).not.toBeChecked();
    expect(addButton()).toBeDisabled();
  });

  it("ignores a changed initialModel without a remount", () => {
    const { rerender } = render(
      <ProductsOfInterestInput value={[]} onChangeAction={vi.fn()} initialModel="vs-8840" />,
    );
    // Documented invariant: initialModel is read once. Callers that need a new
    // seed must unmount (interests-tab lets Radix unmount DialogContent).
    rerender(
      <ProductsOfInterestInput value={[]} onChangeAction={vi.fn()} initialModel="nr-710-12l" />,
    );
    expect(modelField()).toHaveValue("VS-8840");
  });

  it("selects the seeded text on first focus only", () => {
    render(
      <ProductsOfInterestInput value={[]} onChangeAction={vi.fn()} initialModel="vs-8840" />,
    );
    const input = modelField();

    act(() => input.focus());
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("VS-8840".length);

    // A later focus must not hijack the caret the user just placed.
    act(() => input.blur());
    act(() => input.setSelectionRange(3, 3));
    act(() => input.focus());
    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(3);
  });

  it("does not select on focus when there is no seed", async () => {
    const user = userEvent.setup();
    render(<ProductsOfInterestInput value={[]} onChangeAction={vi.fn()} />);
    const input = modelField();

    await user.type(input, "vs-8840");
    act(() => input.blur());
    act(() => input.setSelectionRange(2, 2));
    act(() => input.focus());
    expect(input.selectionStart).toBe(2);
  });
});

describe("ProductsOfInterestInput normalization", () => {
  it("keeps hand-typed text raw until blur, then normalizes it", async () => {
    const user = userEvent.setup();
    render(<ProductsOfInterestInput value={[]} onChangeAction={vi.fn()} />);
    const input = modelField();

    await user.type(input, "  vs-8840 ");
    expect(input).toHaveValue("  vs-8840 ");

    await user.tab();
    expect(input).toHaveValue("VS-8840");
  });

  it("normalizes the model on commit even without a blur", async () => {
    const user = userEvent.setup();
    const onChangeAction = vi.fn();
    render(<ProductsOfInterestInput value={[]} onChangeAction={onChangeAction} />);

    await user.type(modelField(), "vs-8840");
    await user.click(screen.getByRole("radio", { name: "Interested" }));
    await user.click(addButton());

    expect(onChangeAction).toHaveBeenCalledWith([
      { model: "VS-8840", collection: null, brand: null, intent: "interested" },
    ]);
  });

  it("gives the icon-only add button an accessible name", () => {
    render(<ProductsOfInterestInput value={[]} onChangeAction={vi.fn()} />);
    expect(addButton()).toBeInTheDocument();
  });
});

describe("ProductsOfInterestInput accept/reject semantics", () => {
  it("clears the draft when the parent accepts (returns nothing)", async () => {
    const user = userEvent.setup();
    const onChangeAction = vi.fn();
    render(
      <ProductsOfInterestInput
        value={[]}
        onChangeAction={onChangeAction}
        initialModel="vs-8840"
      />,
    );

    await user.click(addButton());

    expect(onChangeAction).toHaveBeenCalledTimes(1);
    expect(modelField()).toHaveValue("");
    expect(screen.getByRole("radio", { name: "Interested" })).not.toBeChecked();
  });

  it("keeps the draft when the parent rejects (returns false)", async () => {
    const user = userEvent.setup();
    const onChangeAction = vi.fn(() => false);
    render(
      <ProductsOfInterestInput
        value={[]}
        onChangeAction={onChangeAction}
        initialModel="vs-8840"
      />,
    );

    await user.type(screen.getByLabelText("Collection"), "Solaris");
    await user.click(addButton());

    expect(onChangeAction).toHaveBeenCalledTimes(1);
    expect(modelField()).toHaveValue("VS-8840");
    expect(screen.getByLabelText("Collection")).toHaveValue("Solaris");
    expect(screen.getByRole("radio", { name: "Interested" })).toBeChecked();
  });

  it("swallows an exact duplicate of an entry already in value", async () => {
    const user = userEvent.setup();
    const onChangeAction = vi.fn();
    render(
      <ProductsOfInterestInput
        value={TRACKED}
        onChangeAction={onChangeAction}
        initialModel="kx1023-01x"
      />,
    );

    await user.type(screen.getByLabelText("Collection"), "Solaris");
    await user.click(screen.getByRole("radio", { name: "Promo" }));
    await user.click(addButton());

    expect(onChangeAction).not.toHaveBeenCalled();
  });
});

describe("ProductsOfInterestInput badge removal", () => {
  it("offers a remove button per entry by default", async () => {
    const user = userEvent.setup();
    const onChangeAction = vi.fn();
    render(<ProductsOfInterestInput value={TRACKED} onChangeAction={onChangeAction} />);

    await user.click(screen.getByRole("button", { name: /^Remove / }));
    expect(onChangeAction).toHaveBeenCalledWith([]);
  });

  it("renders read-only badges when allowRemove is false", () => {
    render(
      <ProductsOfInterestInput value={TRACKED} onChangeAction={vi.fn()} allowRemove={false} />,
    );

    expect(screen.getByText(/KX1023-01X/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
  });
});
