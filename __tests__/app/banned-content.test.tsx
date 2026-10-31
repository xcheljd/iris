import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BannedContent } from "@/app/(app)/banned/banned-content";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { BannedCustomer } from "@/lib/db/schema";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions", () => ({
  banWalkIn: vi.fn(),
  unbanClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/components/topbar", () => ({
  Topbar: () => <div data-testid="topbar" />,
}));

import { toast } from "sonner";
import { unbanClient, banWalkIn } from "@/lib/actions";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const bannedCustomer: BannedCustomer = {
  id: "banned-1",
  customerId: "cust-1",
  firstName: "Bad",
  lastName: "Actor",
  email: "bad@example.test",
  phone: "(555) 010-9999",
  address: null,
  city: null,
  state: null,
  zip: null,
  banReasonCategory: "Reselling",
  specificBanReason: "Flipping grails",
  businessName: null,
  banDate: new Date("2026-01-01"),
  notes: null,
};

const row = { banned: bannedCustomer, clientId: "client-1" };

async function unbanFirstRow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Actions" }));
  await user.click(await screen.findByRole("menuitem", { name: /unban/i }));
  await user.click(await screen.findByRole("button", { name: "Unban" }));
}

describe("BannedContent unban", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("vanishes the row instantly on confirm, before the action settles, and toasts success", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const d = deferred<{ error: string } | undefined>();
    vi.mocked(unbanClient).mockReturnValue(d.promise);

    render(
      <TooltipProvider>
        <BannedContent banned={[row]} isManager />
      </TooltipProvider>
    );

    expect(screen.getByText("Bad Actor")).toBeInTheDocument();

    await unbanFirstRow(user);

    // Pre-await assertion: row already gone from the DOM.
    expect(screen.queryByText("Bad Actor")).not.toBeInTheDocument();
    expect(unbanClient).toHaveBeenCalledWith("client-1");

    await act(async () => {
      d.resolve(undefined);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(toast.success).toHaveBeenCalledWith("Customer unbanned");
    // Still gone after settle (override held until revalidated props land).
    expect(screen.queryByText("Bad Actor")).not.toBeInTheDocument();
  });

  it("rolls back — the row returns when the action resolves { error } (documents the old ad-hoc-filter bug)", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const d = deferred<{ error: string } | undefined>();
    vi.mocked(unbanClient).mockReturnValue(d.promise);

    render(
      <TooltipProvider>
        <BannedContent banned={[row]} isManager />
      </TooltipProvider>
    );

    await unbanFirstRow(user);
    expect(screen.queryByText("Bad Actor")).not.toBeInTheDocument();

    await act(async () => {
      d.resolve({ error: "Cannot unban an active dispute" });
      await d.promise.catch(() => {});
    });

    // Rolled back: row visible again, error toasted.
    expect(screen.getByText("Bad Actor")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("rolls back — the row returns when the action throws", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const d = deferred<{ error: string } | undefined>();
    vi.mocked(unbanClient).mockReturnValue(d.promise);

    render(
      <TooltipProvider>
        <BannedContent banned={[row]} isManager />
      </TooltipProvider>
    );

    await unbanFirstRow(user);
    expect(screen.queryByText("Bad Actor")).not.toBeInTheDocument();

    await act(async () => {
      d.reject(new Error("Failed to unban customer"));
      await d.promise.catch(() => {});
    });

    expect(screen.getByText("Bad Actor")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalled();
  });

  // F-3: the Unban menu item rendered on every row, unconditionally — unlike
  // "View Client Page", which was already gated on `row.clientId`. On a
  // client-less ban row (the seeded walk-ins) confirming Unban hit
  // `handleUnban`'s `if (!clientId) return;`: no server call, no toast, no
  // removal. Every action in this menu is keyed on a client id, so the menu
  // itself is now gated.
  it("offers no actions menu on a ban row with no client", () => {
    render(
      <TooltipProvider>
        <BannedContent
          banned={[{ banned: { ...bannedCustomer, id: "banned-2", customerId: null }, clientId: null }]}
          isManager
        />
      </TooltipProvider>
    );

    expect(screen.getByText("Bad Actor")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
  });

  it("still offers the actions menu on a ban row that has a client", () => {
    render(
      <TooltipProvider>
        <BannedContent banned={[row]} isManager />
      </TooltipProvider>
    );

    expect(screen.getByRole("button", { name: "Actions" })).toBeInTheDocument();
  });
});

// F-2: the dialog used to call banClient(banForm.clientId || "") — a field no
// input ever wrote — and never looked at the result, so a manager got a green
// "Customer banned successfully" for a ban that never happened.
describe("BannedContent ban walk-in dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function openDialogAndFill(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /ban customer/i }));
    await user.type(await screen.findByLabelText("First Name *"), "Casey");
    await user.type(screen.getByLabelText("Last Name"), "Rivera");
    await user.type(screen.getByLabelText("Email"), "casey@example.test");
    await user.type(screen.getByLabelText("Phone"), "(702) 555-0100");
    await user.type(screen.getByLabelText("Reason / Details"), "Flipping allocations");
  }

  it("sends the typed walk-in fields to banWalkIn", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    vi.mocked(banWalkIn).mockResolvedValue(undefined);

    render(
      <TooltipProvider>
        <BannedContent banned={[]} isManager />
      </TooltipProvider>
    );

    await openDialogAndFill(user);
    await user.click(screen.getAllByRole("button", { name: /^Ban Customer$/ }).at(-1)!);

    expect(banWalkIn).toHaveBeenCalledWith({
      firstName: "Casey",
      lastName: "Rivera",
      email: "casey@example.test",
      phone: "(702) 555-0100",
      category: "Other",
      reason: "Flipping allocations",
    });
    expect(toast.success).toHaveBeenCalledWith("Customer banned successfully");
  });

  it("toasts the action's error instead of success when the ban is rejected", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    vi.mocked(banWalkIn).mockResolvedValue({ error: "First name is required" });

    render(
      <TooltipProvider>
        <BannedContent banned={[]} isManager />
      </TooltipProvider>
    );

    await openDialogAndFill(user);
    await user.click(screen.getAllByRole("button", { name: /^Ban Customer$/ }).at(-1)!);

    expect(toast.error).toHaveBeenCalledWith("First name is required");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
