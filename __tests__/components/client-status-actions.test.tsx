import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "mgr", role: "manager" } } }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions", () => ({
  banClient: vi.fn(),
  unsubscribeClient: vi.fn(),
  createApprovalRequest: vi.fn(),
  deleteClient: vi.fn(),
  restoreClient: vi.fn(),
}));

import { toast } from "sonner";
import { deleteClient, restoreClient, unsubscribeClient } from "@/lib/actions";
import { DeleteCustomerDialog, UnsubscribeCustomerDialog } from "@/components/client-status-actions";

describe("DeleteCustomerDialog (manager)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Regression: the delete used `window.location.href = "/clients"`, a full
  // document load that tore down the success toast right after it fired.
  it("soft-navigates to /clients and shows the success toast", async () => {
    vi.mocked(deleteClient).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <DeleteCustomerDialog clientId="c1" clientName="Jane Doe">
        <button>Open delete</button>
      </DeleteCustomerDialog>,
    );

    await user.click(screen.getByRole("button", { name: "Open delete" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/clients"));
    expect(deleteClient).toHaveBeenCalledWith("c1");
    expect(toast.success).toHaveBeenCalledWith("Client deleted", expect.objectContaining({ action: expect.objectContaining({ label: "Undo" }) }));
  });

  it("Undo on the success toast restores the client", async () => {
    vi.mocked(deleteClient).mockResolvedValue(undefined);
    vi.mocked(restoreClient).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <DeleteCustomerDialog clientId="c1" clientName="Jane Doe">
        <button>Open delete</button>
      </DeleteCustomerDialog>,
    );

    await user.click(screen.getByRole("button", { name: "Open delete" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());

    const opts = vi.mocked(toast.success).mock.calls[0][1] as unknown as { action: { onClick: () => Promise<void> } };
    await opts.action.onClick();
    expect(restoreClient).toHaveBeenCalledWith("c1");
    expect(mockRefresh).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

// M7: the manager unsubscribe/ban paths awaited the action and toasted
// success unconditionally, so a returned { error } read as a win.
describe("UnsubscribeCustomerDialog (manager)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("toasts an error, not success, when the action returns { error }", async () => {
    vi.mocked(unsubscribeClient).mockResolvedValue({ error: "Client not found" });
    const user = userEvent.setup();
    render(
      <UnsubscribeCustomerDialog clientId="c1" clientName="Jane Doe">
        <button>Open unsubscribe</button>
      </UnsubscribeCustomerDialog>,
    );

    await user.click(screen.getByRole("button", { name: "Open unsubscribe" }));
    await user.click(await screen.findByRole("button", { name: "Unsubscribe" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to unsubscribe customer"));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
