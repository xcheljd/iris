import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/actions", () => ({ patchClientFromFormMerge: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "sonner";
import { MergeFromFormDialog } from "@/components/merge/merge-from-form-dialog";
import type { ClientFormData } from "@/components/client-form";

const formData: ClientFormData = {
  firstName: "New", lastName: "Entry", phone: "", email: "", customerId: "", source: "Walk-in",
  preferredContact: "", birthday: null, anniversary: null, onEmailList: false, notes: "", tags: [],
};

afterEach(() => vi.unstubAllGlobals());

// M4: the dialog fed a 404's `{ error }` body straight into the resolution
// panel as if it were the existing client.
describe("MergeFromFormDialog", () => {
  it("reports a failed client fetch instead of rendering the error body as a client", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Client not found" }), { status: 404 }),
    ));
    render(
      <MergeFromFormDialog
        existingClientId="missing"
        formData={formData}
        productsOfInterest={[]}
        open
        onOpenChangeAction={vi.fn()}
        onMergedAction={vi.fn()}
      />,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Merge Records" })).toBeDisabled();
  });
});
