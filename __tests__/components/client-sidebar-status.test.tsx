import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientSidebar } from "@/components/client-sidebar";
import { ClientProvider } from "@/components/client-provider";
import type { FullClient } from "@/components/client-provider";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("date-fns", () => ({
  format: vi.fn(() => "Jan 1, 2026"),
}));

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({
    data: { user: { id: "mgr", name: "Test", role: "manager" } },
  })),
}));

vi.mock("@/lib/actions", async () => {
  const actual = await vi.importActual("@/lib/actions");
  return {
    ...actual,
    deleteClient: vi.fn(),
    banClient: vi.fn(),
    unsubscribeClient: vi.fn(),
  };
});

vi.mock("@/components/outreach-logger", () => ({
  OutreachLogger: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

vi.mock("@/components/client-status-actions", () => ({
  BanCustomerDialog: ({ children }: { children: React.ReactNode }) => <div data-testid="ban-dialog">{children}</div>,
  UnsubscribeCustomerDialog: ({ children }: { children: React.ReactNode }) => <div data-testid="unsub-dialog">{children}</div>,
}));

const mockClient: FullClient = {
  id: "c1", firstName: "John", lastName: "Doe", phone: "(555) 123-4567", email: "john@test.com",
  employeeId: "e1", employeeName: "Marcus", customerId: null, dateAdded: "2025-01-01T00:00:00Z",
  productsOfInterest: [], notes: null, onEmailList: true,
  status: "active", source: "Walk-in", birthday: null, anniversary: null,
  tags: ["VIP"], heatScore: 75, heatLevel: "hot",
  lastOutreachAt: null, lastPurchaseAt: null,
  createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
  outreach: [], timeline: [], matches: [], allTags: [], followUps: [],
};

function renderWithProvider(ui: React.ReactNode) {
  return render(<ClientProvider client={mockClient}>{ui}</ClientProvider>);
}

describe("ClientSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders client name", () => {
    renderWithProvider(<ClientSidebar />);
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("shows phone number", () => {
    renderWithProvider(<ClientSidebar />);
    expect(screen.getByText("(555) 123-4567")).toBeInTheDocument();
  });

  it("shows email", () => {
    renderWithProvider(<ClientSidebar />);
    expect(screen.getByText("john@test.com")).toBeInTheDocument();
  });

  it("shows HOT badge for hot heatLevel", () => {
    renderWithProvider(<ClientSidebar />);
    expect(screen.getByText("HOT")).toBeInTheDocument();
  });

  it("shows no scheduled follow-ups when empty", () => {
    renderWithProvider(<ClientSidebar />);
    expect(screen.getByText(/No scheduled follow-ups/)).toBeInTheDocument();
  });

  it("shows Delete Client button for managers", () => {
    renderWithProvider(<ClientSidebar currentUserRole="manager" />);
    expect(screen.getByText("Delete Client")).toBeInTheDocument();
  });

  it("hides Delete Client button for non-managers", () => {
    renderWithProvider(<ClientSidebar />);
    expect(screen.queryByText("Delete Client")).not.toBeInTheDocument();
  });

  it("hides Delete Client when client is already deleted", () => {
    const deletedClient = { ...mockClient, status: "deleted" as const };
    render(
      <ClientProvider client={deletedClient}>
        <ClientSidebar currentUserRole="manager" />
      </ClientProvider>
    );
    expect(screen.queryByText("Delete Client")).not.toBeInTheDocument();
  });
});
