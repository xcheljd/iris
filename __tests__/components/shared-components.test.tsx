import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PaginationFooter } from "@/components/pagination-footer";
import { SearchInput } from "@/components/search-input";
import { EmptyState } from "@/components/empty-state";

// ---------------------------------------------------------------------------
// ConfirmDialog
// ---------------------------------------------------------------------------
describe("ConfirmDialog", () => {
  const defaults = {
    open: true,
    onOpenChange: vi.fn(),
    title: "Delete item?",
    description: "This action cannot be undone.",
    confirmLabel: "Delete",
    onConfirm: vi.fn(),
  };

  it("renders title and description when open=true", () => {
    render(<ConfirmDialog {...defaults} />);
    expect(screen.getByText("Delete item?")).toBeInTheDocument();
    expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
  });

  it("renders confirmLabel on the action button", () => {
    render(<ConfirmDialog {...defaults} confirmLabel="Confirm" />);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDialog {...defaults} onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("renders a Cancel button", () => {
    render(<ConfirmDialog {...defaults} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("applies destructive class when variant is destructive", () => {
    render(<ConfirmDialog {...defaults} variant="destructive" />);
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toContain("bg-destructive");
  });

  it("disables confirm button when disabled=true", () => {
    render(<ConfirmDialog {...defaults} disabled />);
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// PaginationFooter
// ---------------------------------------------------------------------------
describe("PaginationFooter", () => {
  const defaults = {
    currentPage: 1,
    totalPages: 5,
    onPageChange: vi.fn(),
    totalItems: 50,
    pageSize: 10,
    itemLabel: "clients",
  };

  it("returns null when totalPages <= 1", () => {
    const { container } = render(
      <PaginationFooter {...defaults} totalPages={1} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows Page X of Y text", () => {
    render(<PaginationFooter {...defaults} currentPage={3} totalPages={5} />);
    expect(screen.getByText(/Page 3 of 5/)).toBeInTheDocument();
  });

  it("shows item range with itemLabel", () => {
    render(
      <PaginationFooter
        {...defaults}
        currentPage={1}
        totalItems={50}
        pageSize={10}
        itemLabel="clients"
      />,
    );
    expect(screen.getByText(/1–10 of 50 clients/)).toBeInTheDocument();
  });

  it("disables Previous button when currentPage is 1", () => {
    render(<PaginationFooter {...defaults} currentPage={1} />);
    expect(screen.getByRole("button", { name: "Go to previous page" })).toBeDisabled();
  });

  it("disables Next button when currentPage equals totalPages", () => {
    render(<PaginationFooter {...defaults} currentPage={5} totalPages={5} />);
    expect(screen.getByRole("button", { name: "Go to next page" })).toBeDisabled();
  });

  it("calls onPageChange with correct page when buttons are clicked", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PaginationFooter
        {...defaults}
        currentPage={2}
        totalPages={5}
        onPageChange={onPageChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Go to previous page" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("uses Previous/Next text by default and icons when variant is icons", () => {
    // text variant (default) — buttons have text labels
    const { unmount } = render(
      <PaginationFooter {...defaults} variant="text" />,
    );
    expect(screen.getByRole("button", { name: "Go to previous page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to next page" })).toBeInTheDocument();
    unmount();

    // icons variant — buttons contain SVGs instead of text
    const { container } = render(
      <PaginationFooter {...defaults} variant="icons" />,
    );
    const buttons = container.querySelectorAll("button");
    // Each button should contain an svg child (ChevronLeft/ChevronRight)
    buttons.forEach((btn) => {
      expect(btn.querySelector("svg")).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// SearchInput
// ---------------------------------------------------------------------------
describe("SearchInput", () => {
  it("renders input with value and placeholder", () => {
    render(
      <SearchInput value="hello" onChange={vi.fn()} placeholder="Find…" />,
    );
    const input = screen.getByPlaceholderText("Find…") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("hello");
  });

  it("calls onChange when typing", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SearchInput value="" onChange={onChange} />);
    await user.type(screen.getByRole("textbox"), "ab");
    // called once per character
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, "a");
    expect(onChange).toHaveBeenNthCalledWith(2, "b");
  });

  it("shows clear button when value is non-empty", () => {
    render(<SearchInput value="search term" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Clear search")).toBeInTheDocument();
  });

  it("hides clear button when value is empty", () => {
    render(<SearchInput value="" onChange={vi.fn()} />);
    expect(screen.queryByLabelText("Clear search")).not.toBeInTheDocument();
  });

  it('calls onChange("") when clear button is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SearchInput value="term" onChange={onChange} />);
    await user.click(screen.getByLabelText("Clear search"));
    expect(onChange).toHaveBeenCalledWith("");
  });
});

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------
describe("EmptyState", () => {
  it("renders title and description", () => {
    render(<EmptyState title="No items" description="Add one to get started." />);
    expect(screen.getByText("No items")).toBeInTheDocument();
    expect(screen.getByText("Add one to get started.")).toBeInTheDocument();
  });

  it("renders action button with label when action is provided", () => {
    render(
      <EmptyState
        title="Empty"
        action={{ label: "Create new", onClick: vi.fn() }}
      />,
    );
    expect(screen.getByRole("button", { name: "Create new" })).toBeInTheDocument();
  });

  it("calls action.onClick when action button is clicked", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <EmptyState title="Empty" action={{ label: "Create", onClick }} />,
    );
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("applies compact class (py-8) when compact=true", () => {
    const { container } = render(
      <EmptyState title="Compact" compact />,
    );
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).toContain("py-8");
    expect(wrapper.className).not.toContain("py-12");
  });

  it("uses default padding (py-12) when compact is not set", () => {
    const { container } = render(<EmptyState title="Default" />);
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).toContain("py-12");
    expect(wrapper.className).not.toContain("py-8");
  });

  it("renders nothing for missing title and description", () => {
    const { container } = render(<EmptyState />);
    expect(screen.queryByText("No items")).not.toBeInTheDocument();
    // The Empty wrapper still renders, but no title/description text nodes
    const wrapper = container.firstElementChild!;
    const titles = wrapper.querySelectorAll("[data-slot='empty-title']");
    const descriptions = wrapper.querySelectorAll("[data-slot='empty-description']");
    expect(titles.length).toBe(0);
    expect(descriptions.length).toBe(0);
  });
});
