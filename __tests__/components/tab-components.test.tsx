import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProfileTab } from "@/components/profile-tab";
import { TagsTab } from "@/components/tags-tab";
import { OutreachHistoryTab } from "@/components/outreach-history-tab";
import { ActivityTimelineTab } from "@/components/activity-timeline-tab";
import type { FullClient } from "@/components/client-provider";

vi.mock("date-fns", () => ({
  format: vi.fn(() => "Jan 1, 2026"),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({
    data: { user: { id: "mgr", name: "Test", role: "manager" } },
  })),
}));

vi.mock("@/components/outreach-logger", () => ({
  OutreachLogger: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

vi.mock("@/components/edit-client-dialog", () => ({
  EditClientDialog: () => <div>EditDialog</div>,
}));

const baseClient: FullClient = {
  id: "c1",
  firstName: "John",
  lastName: "Doe",
  phone: "(555) 123-4567",
  email: "john@test.com",
  employeeId: "e1",
  employeeName: "Marcus",
  customerId: null,
  dateAdded: "2025-01-01T00:00:00Z",
  productsOfInterest: ["KX1023-01X"],
  notes: null,
  onEmailList: true,
  status: "active",
  source: "Walk-in",
  birthday: "1990-06-15",
  anniversary: "2020-09-20",
  tags: ["VIP", "repeat-buyer"],
  heatScore: 75,
  heatLevel: "hot",
  lastOutreachAt: "2026-01-01T00:00:00Z",
  lastPurchaseAt: "2026-01-15T00:00:00Z",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2026-01-15T00:00:00Z",
  outreach: [],
  timeline: [],
  matches: [],
  allTags: [{ id: "t1", name: "VIP", color: "blue", usageCount: 5 }],
  followUps: [],
};

// ─── ProfileTab ──────────────────────────────────────────────────────────────

describe("ProfileTab", () => {
  it('renders "Contact Information" card title', () => {
    render(<ProfileTab client={baseClient} />);
    expect(screen.getByText("Contact Information")).toBeInTheDocument();
  });

  it("shows phone and email", () => {
    render(<ProfileTab client={baseClient} />);
    expect(screen.getByText("(555) 123-4567")).toBeInTheDocument();
    expect(screen.getByText("john@test.com")).toBeInTheDocument();
  });

  it("shows birthday when present", () => {
    render(<ProfileTab client={baseClient} />);
    expect(screen.getByText("Birthday:")).toBeInTheDocument();
    expect(screen.getAllByText("Jan 1, 2026").length).toBeGreaterThanOrEqual(1);
  });

  it("shows status badge", () => {
    render(<ProfileTab client={baseClient} />);
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it('shows "Not provided" when phone is null', () => {
    const noPhone = { ...baseClient, phone: null };
    render(<ProfileTab client={noPhone} />);
    expect(screen.getByText("Not provided")).toBeInTheDocument();
  });
});

// ─── TagsTab ─────────────────────────────────────────────────────────────────

describe("TagsTab", () => {
  it('renders "Current Tags" heading', () => {
    render(<TagsTab client={baseClient} />);
    expect(screen.getByText("Current Tags")).toBeInTheDocument();
  });

  it('shows tag count "2 tags assigned"', () => {
    render(<TagsTab client={baseClient} />);
    expect(screen.getByText("2 tags assigned")).toBeInTheDocument();
  });

  it("shows each tag name", () => {
    render(<TagsTab client={baseClient} />);
    expect(screen.getAllByText("VIP").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("repeat-buyer").length).toBeGreaterThanOrEqual(1);
  });

  it('shows "No tags assigned" for client with empty tags', () => {
    const noTagsClient = { ...baseClient, tags: [] };
    render(<TagsTab client={noTagsClient} />);
    expect(screen.getByText("No tags assigned to this client")).toBeInTheDocument();
  });
});

// ─── OutreachHistoryTab ──────────────────────────────────────────────────────

describe("OutreachHistoryTab", () => {
  const clientWithOutreach: FullClient = {
    ...baseClient,
    outreach: [
      {
        id: "ol1",
        clientId: "c1",
        method: "call",
        date: new Date("2026-01-01"),
        outcome: "responded",
        purchasedModel: null,
        notes: "Called back",
        employeeId: null,
        followUpDate: null,
        templateId: null,
        completed: true,
      },
    ],
  };

  it('renders "Outreach History" heading', () => {
    render(<OutreachHistoryTab client={clientWithOutreach} />);
    expect(screen.getByText("Outreach History")).toBeInTheDocument();
  });

  it('shows "Total Outreach" count', () => {
    render(<OutreachHistoryTab client={clientWithOutreach} />);
    expect(screen.getByText("Total Outreach")).toBeInTheDocument();
    // The count "1" appears in a bold div inside the card
    const countElements = screen.getAllByText("1");
    expect(countElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Positive" count (responded + purchased)', () => {
    render(<OutreachHistoryTab client={clientWithOutreach} />);
    expect(screen.getByText("Positive")).toBeInTheDocument();
  });

  it('shows "No outreach history recorded" for empty outreach', () => {
    render(<OutreachHistoryTab client={baseClient} />);
    expect(screen.getByText("No outreach history recorded")).toBeInTheDocument();
  });
});

// ─── ActivityTimelineTab ─────────────────────────────────────────────────────

describe("ActivityTimelineTab", () => {
  const clientWithTimeline: FullClient = {
    ...baseClient,
    timeline: [
      {
        id: "ae1",
        clientId: "c1",
        eventType: "created",
        description: "Client added",
        metadata: null,
        employeeId: null,
        createdAt: new Date("2026-01-01"),
      },
    ],
  };

  it('renders "Activity Timeline" heading', () => {
    render(<ActivityTimelineTab client={clientWithTimeline} />);
    expect(screen.getByText("Activity Timeline")).toBeInTheDocument();
  });

  it('shows "Total Events" count', () => {
    render(<ActivityTimelineTab client={clientWithTimeline} />);
    expect(screen.getByText("Total Events")).toBeInTheDocument();
  });

  it('shows event type badge "created"', () => {
    render(<ActivityTimelineTab client={clientWithTimeline} />);
    expect(screen.getByText("created")).toBeInTheDocument();
  });

  it('shows "0 Purchases" when no purchase events', () => {
    render(<ActivityTimelineTab client={clientWithTimeline} />);
    // Purchases card shows the count 0 and label "Purchases"
    expect(screen.getByText("Purchases")).toBeInTheDocument();
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });
});
