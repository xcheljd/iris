import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
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
}));

import { toast } from "sonner";
import { deleteClient } from "@/lib/actions";
import { DeleteCustomerDialog } from "@/components/client-status-actions";

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
    expect(toast.success).toHaveBeenCalledWith("Client deleted");
  });
});
