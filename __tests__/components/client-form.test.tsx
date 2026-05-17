import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientForm } from "@/components/client-form";
import type { ClientFormData } from "@/components/client-form";
import type { ProductOfInterest } from "@/lib/db/schema";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("date-fns", () => ({
  format: vi.fn(() => "Jan 1, 2026"),
}));

vi.mock("@/components/date-picker", () => ({
  DatePicker: ({ placeholder }: { placeholder: string }) => (
    <button>{placeholder}</button>
  ),
}));

const baseFormData: ClientFormData = {
  firstName: "John", lastName: "Doe", phone: "(555) 123-4567", email: "john@test.com",
  customerId: "", source: "Walk-in", preferredContact: "call", birthday: null, anniversary: null,
  onEmailList: false, notes: "", tags: ["VIP"],
};

function createProps(overrides: Record<string, unknown> = {}) {
  return {
    formData: baseFormData,
    productsOfInterest: [{ model: "KX1023-01X", collection: null, brand: null, intent: "interested" }] as ProductOfInterest[],
    newTag: "",
    onFieldChange: vi.fn(),
    onNewTagChange: vi.fn(),
    onProductsChange: vi.fn(),
    onAddTag: vi.fn(),
    onRemoveTag: vi.fn(),
    showDuplicateWarning: false,
    duplicateClient: null,
    onDismissDuplicate: vi.fn(),
    onEditExisting: vi.fn(),
    isLoading: false,
    submitLabel: "Create Client",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

describe("ClientForm", () => {
  it("renders Basic Information card", () => {
    render(<ClientForm {...createProps()} />);
    expect(screen.getByText("Basic Information")).toBeInTheDocument();
  });

  it("renders Contact Information card", () => {
    render(<ClientForm {...createProps()} />);
    expect(screen.getByText("Contact Information")).toBeInTheDocument();
  });

  it("renders existing products of interest", () => {
    render(<ClientForm {...createProps()} />);
    // Badge renders as "<model> · <Intent>" in the structured editor.
    expect(screen.getByText(/KX1023-01X/)).toBeInTheDocument();
  });

  it("renders existing tags", () => {
    render(<ClientForm {...createProps()} />);
    expect(screen.getByText("VIP")).toBeInTheDocument();
  });

  it("renders Notes card", () => {
    render(<ClientForm {...createProps()} />);
    expect(screen.getByText("Notes (optional)")).toBeInTheDocument();
  });

  it("renders submit button with submitLabel text", () => {
    render(<ClientForm {...createProps()} submitLabel="Create Client" />);
    expect(screen.getByText("Create Client")).toBeInTheDocument();
  });

  it("shows Saving when isLoading is true", () => {
    render(<ClientForm {...createProps({ isLoading: true })} />);
    expect(screen.getByText("Saving...")).toBeInTheDocument();
  });

  it("calls onFieldChange when first name input changes", async () => {
    const onFieldChange = vi.fn();
    const user = userEvent.setup();
    render(<ClientForm {...createProps({ onFieldChange })} />);
    const input = screen.getByPlaceholderText("Enter first name");
    await user.clear(input);
    await user.type(input, "Jane");
    expect(onFieldChange).toHaveBeenCalled();
  });

  it("calls onAddTag when tag add button clicked", async () => {
    const onAddTag = vi.fn();
    const user = userEvent.setup();
    render(<ClientForm {...createProps({ newTag: "new-tag", onAddTag })} />);
    // The Tags card has an input with placeholder "Add tag..." and a sibling Plus button
    const tagInput = screen.getByPlaceholderText("Add tag...");
    // The Plus button is a sibling in the same flex container
    const flexContainer = tagInput.parentElement!;
    const plusBtn = flexContainer.querySelector("button")!;
    await user.click(plusBtn);
    expect(onAddTag).toHaveBeenCalled();
  });

  it("shows duplicate warning when enabled", () => {
    render(
      <ClientForm
        {...createProps({
          showDuplicateWarning: true,
          duplicateClient: { id: "dup1", firstName: "Jane", lastName: "Smith", phone: null, email: null },
        })}
      />
    );
    expect(screen.getByText("Potential Duplicate Found")).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it("shows Status and Preferences heading in edit mode", () => {
    render(
      <ClientForm
        {...createProps({
          formData: { ...baseFormData, status: "active" },
        })}
      />
    );
    expect(screen.getByText("Status & Preferences")).toBeInTheDocument();
  });

  it("shows Preferences and Source heading in new mode", () => {
    render(<ClientForm {...createProps()} />);
    expect(screen.getByText("Preferences & Source")).toBeInTheDocument();
  });
});
