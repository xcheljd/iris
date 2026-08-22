import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { ClientDetailTabs } from "@/components/client-detail-tabs";
import { useClient, type FullClient } from "@/components/client-provider";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions", () => ({
  toggleEmailList: vi.fn(),
  resubscribeClient: vi.fn(),
  unbanClient: vi.fn(),
}));

vi.mock("@/components/client-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/client-provider")>();
  return { ...actual, useClient: vi.fn() };
});

// Stub heavy child tabs and dialog shells — passthroughs keep their triggers.
vi.mock("@/components/profile-tab", () => ({ ProfileTab: () => <div data-testid="profile-tab" /> }));
vi.mock("@/components/interests-tab", () => ({ InterestsTab: () => <div /> }));
vi.mock("@/components/outreach-history-tab", () => ({ OutreachHistoryTab: () => <div /> }));
vi.mock("@/components/activity-timeline-tab", () => ({ ActivityTimelineTab: () => <div /> }));
vi.mock("@/components/notes-tab", () => ({ NotesTab: () => <div /> }));
vi.mock("@/components/tags-tab", () => ({ TagsTab: () => <div /> }));
vi.mock("@/components/heat-score-bar", () => ({ HeatScoreBar: () => <div /> }));
vi.mock("@/components/edit-client-dialog", () => ({
  EditClientDialog: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/outreach-logger", () => ({
  OutreachLogger: ({ trigger }: { trigger?: ReactNode }) => <>{trigger}</>,
}));
vi.mock("@/components/client-status-actions", () => ({
  BanCustomerDialog: ({ children }: { children?: ReactNode }) => <>{children}</>,
  UnsubscribeCustomerDialog: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DeleteCustomerDialog: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/transfer-client-dialog", () => ({
  TransferClientDialog: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/merge-client-dialog", () => ({
  MergeClientDialog: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

import { toast } from "sonner";
import { toggleEmailList, unbanClient, resubscribeClient } from "@/lib/actions";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeClient(overrides: Partial<FullClient> = {}): FullClient {
  return {
    id: "client-1",
    firstName: "Casey",
    lastName: "Voss",
    phone: null,
    email: "casey@example.test",
    employeeId: "emp-1",
    employeeName: null,
    customerId: "#001",
    dateAdded: new Date("2026-01-01").toISOString(),
    productsOfInterest: [],
    notes: null,
    onEmailList: true,
    preferredContact: null,
    status: "active",
    source: "walk-in" as FullClient["source"],
    birthday: null,
    anniversary: null,
    tags: [],
    heatScore: 50,
    heatLevel: "warm",
    lastOutreachAt: null,
    lastPurchaseAt: null,
    createdAt: new Date("2026-01-01").toISOString(),
    updatedAt: new Date("2026-01-01").toISOString(),
    outreach: [],
    timeline: [],
    matches: [],
    allTags: [],
    followUps: [],
    ...overrides,
  };
}

function renderTabs(client: FullClient) {
  vi.mocked(useClient).mockReturnValue(client);
  return render(<ClientDetailTabs currentUserRole="manager" />);
}

async function openActions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Actions" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ClientDetailTabs optimistic toggles", () => {
  describe("email-list toggle", () => {
    it('flips "Remove from Email List" → "Add to Email List" instantly pre-await, toasts success', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const d = deferred<{ error: string } | undefined>();
      vi.mocked(toggleEmailList).mockReturnValue(d.promise);

      renderTabs(makeClient());
      await openActions(user);
      await user.click(screen.getByRole("menuitem", { name: /remove from email list/i }));
      await user.click(await screen.findByRole("button", { name: "Remove" }));

      // Pre-await: menu already shows the flipped label.
      expect(toggleEmailList).toHaveBeenCalledWith("client-1");
      expect(screen.queryByRole("menuitem", { name: /remove from email list/i })).not.toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /add to email list/i })).toBeInTheDocument();

      await act(async () => {
        d.resolve(undefined);
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(toast.success).toHaveBeenCalledWith("Removed from email list");
    });

    it("rolls back to Remove when the action resolves { error }", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const d = deferred<{ error: string } | undefined>();
      vi.mocked(toggleEmailList).mockReturnValue(d.promise);

      renderTabs(makeClient());
      await openActions(user);
      await user.click(screen.getByRole("menuitem", { name: /remove from email list/i }));
      await user.click(await screen.findByRole("button", { name: "Remove" }));
      expect(screen.getByRole("menuitem", { name: /add to email list/i })).toBeInTheDocument();

      await act(async () => {
        d.resolve({ error: "Not authorized to change this client's email list" });
        await d.promise.catch(() => {});
      });

      expect(screen.getByRole("menuitem", { name: /remove from email list/i })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: /add to email list/i })).not.toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith("Not authorized to change this client's email list");
      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe("unban", () => {
    it('flips banned menu items to active instantly pre-await, toasts "Customer unbanned"', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const d = deferred<void>();
      vi.mocked(unbanClient).mockReturnValue(d.promise);

      renderTabs(makeClient({ status: "banned", onEmailList: false }));
      await openActions(user);
      await user.click(screen.getByRole("menuitem", { name: /unban customer/i }));
      await user.click(await screen.findByRole("button", { name: "Unban" }));

      // Pre-await: banned entry gone, active-only entries appear.
      expect(unbanClient).toHaveBeenCalledWith("client-1");
      expect(screen.queryByRole("menuitem", { name: /unban customer/i })).not.toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Ban Customer" })).toBeInTheDocument();

      await act(async () => {
        d.resolve(undefined);
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(toast.success).toHaveBeenCalledWith("Customer unbanned");
    });

    it("rolls back when the action throws", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const d = deferred<void>();
      vi.mocked(unbanClient).mockReturnValue(d.promise);

      renderTabs(makeClient({ status: "banned", onEmailList: false }));
      await openActions(user);
      await user.click(screen.getByRole("menuitem", { name: /unban customer/i }));
      await user.click(await screen.findByRole("button", { name: "Unban" }));
      expect(screen.getByRole("menuitem", { name: "Ban Customer" })).toBeInTheDocument();

      await act(async () => {
        d.reject(new Error("boom"));
        await d.promise.catch(() => {});
      });

      expect(screen.getByRole("menuitem", { name: /unban customer/i })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: "Ban Customer" })).not.toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith("Failed to unban");
      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe("resubscribe", () => {
    it('flips unsubscribed menu items to active instantly pre-await, toasts "Customer resubscribed"', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const d = deferred<void>();
      vi.mocked(resubscribeClient).mockReturnValue(d.promise);

      renderTabs(makeClient({ status: "unsubscribed", onEmailList: false }));
      await openActions(user);
      expect(screen.queryByRole("menuitem", { name: "Ban Customer" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("menuitem", { name: /^resubscribe$/i }));
      await user.click(await screen.findByRole("button", { name: "Resubscribe" }));

      // Pre-await: unsubscribed entry gone, active-only entries appear.
      expect(resubscribeClient).toHaveBeenCalledWith("client-1");
      expect(screen.queryByRole("menuitem", { name: /^resubscribe$/i })).not.toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Ban Customer" })).toBeInTheDocument();

      await act(async () => {
        d.resolve(undefined);
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(toast.success).toHaveBeenCalledWith("Customer resubscribed");
    });

    it("rolls back when the action throws", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const d = deferred<void>();
      vi.mocked(resubscribeClient).mockReturnValue(d.promise);

      renderTabs(makeClient({ status: "unsubscribed", onEmailList: false }));
      await openActions(user);
      await user.click(screen.getByRole("menuitem", { name: /^resubscribe$/i }));
      await user.click(await screen.findByRole("button", { name: "Resubscribe" }));
      expect(screen.getByRole("menuitem", { name: "Ban Customer" })).toBeInTheDocument();

      await act(async () => {
        d.reject(new Error("boom"));
        await d.promise.catch(() => {});
      });

      expect(screen.getByRole("menuitem", { name: /^resubscribe$/i })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: "Ban Customer" })).not.toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith("Failed to resubscribe");
      expect(toast.success).not.toHaveBeenCalled();
    });
  });
});
