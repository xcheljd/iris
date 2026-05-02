import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotesTab } from "@/components/notes-tab";
import type { FullClient } from "@/components/client-provider";

// Mock date-fns
vi.mock("date-fns", () => ({
  format: vi.fn((d) => "Jan 1, 2026 • 12:00 AM"),
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function makeClient(overrides: Partial<FullClient> = {}): FullClient {
  return {
    id: "client-1",
    firstName: "John",
    lastName: "Doe",
    dateAdded: "2025-01-01",
    productsOfInterest: [],
    onEmailList: false,
    status: "active",
    source: "Walk-in",
    notes: null,
    tags: [],
    heatScore: 0,
    heatLevel: "cold",
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
    outreach: [],
    timeline: [],
    matches: [],
    allTags: [],
    followUps: [],
    ...overrides,
  };
}

const mockNotes = [
  { content: "First note content", createdAt: "2026-01-01T10:00:00Z", author: "Marcus" },
  { content: "Second note content", createdAt: "2026-01-02T14:00:00Z", author: "Alice" },
];

const clientWithNotes = makeClient({
  id: "client-1",
  firstName: "John",
  lastName: "Doe",
  notes: JSON.stringify(mockNotes),
  updatedAt: "2026-01-02T14:00:00Z",
});

const clientWithNoNotes = makeClient({
  id: "client-2",
  firstName: "Jane",
  lastName: "Smith",
  notes: null,
  updatedAt: "2026-01-01T00:00:00Z",
});

const clientWithStringNotes = makeClient({
  id: "client-3",
  firstName: "Bob",
  lastName: "Jones",
  notes: "just a string note",
  updatedAt: "2026-01-01T00:00:00Z",
});

describe("NotesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response)
    ) as any;
    Object.defineProperty(window, "location", {
      value: { reload: vi.fn() },
      writable: true,
    });
  });

  it("renders the Add New Note card", () => {
    render(<NotesTab client={clientWithNotes} />);
    expect(screen.getByText("Add New Note")).toBeInTheDocument();
  });

  it("renders the Client Notes card", () => {
    render(<NotesTab client={clientWithNotes} />);
    expect(screen.getByText("Client Notes")).toBeInTheDocument();
  });

  it("displays existing notes", () => {
    render(<NotesTab client={clientWithNotes} />);
    expect(screen.getByText("First note content")).toBeInTheDocument();
    expect(screen.getByText("Second note content")).toBeInTheDocument();
  });

  it("shows note count", () => {
    render(<NotesTab client={clientWithNotes} />);
    expect(screen.getByText("2 notes total")).toBeInTheDocument();
  });

  it("shows note author badges", () => {
    render(<NotesTab client={clientWithNotes} />);
    expect(screen.getByText("Marcus")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows empty state when client has no notes", () => {
    render(<NotesTab client={clientWithNoNotes} />);
    expect(screen.getByText("No notes recorded for this client")).toBeInTheDocument();
    expect(screen.getByText("Add your first note to get started")).toBeInTheDocument();
  });

  it("shows singular note count for a single note", () => {
    const clientWithOneNote = makeClient({
      ...clientWithNotes,
      notes: JSON.stringify([mockNotes[0]]),
    });
    render(<NotesTab client={clientWithOneNote} />);
    expect(screen.getByText("1 note total")).toBeInTheDocument();
  });

  it("shows Add Note button initially, clicking shows textarea", async () => {
    const user = userEvent.setup();
    render(<NotesTab client={clientWithNoNotes} />);
    const addBtn = screen.getByRole("button", { name: /add note/i });
    expect(addBtn).toBeInTheDocument();

    await user.click(addBtn);
    expect(screen.getByPlaceholderText("Enter your note here...")).toBeInTheDocument();
  });

  it("shows Cancel button when adding a note", async () => {
    const user = userEvent.setup();
    render(<NotesTab client={clientWithNoNotes} />);

    await user.click(screen.getByRole("button", { name: /add note/i }));
    // There are two cancel buttons (one in header, one in footer)
    const cancelButtons = screen.getAllByRole("button", { name: /cancel/i });
    expect(cancelButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("clicking Cancel hides the textarea", async () => {
    const user = userEvent.setup();
    render(<NotesTab client={clientWithNoNotes} />);

    await user.click(screen.getByRole("button", { name: /add note/i }));
    expect(screen.getByPlaceholderText("Enter your note here...")).toBeInTheDocument();

    // Click the first Cancel button
    await user.click(screen.getAllByRole("button", { name: /cancel/i })[0]);
    expect(screen.queryByPlaceholderText("Enter your note here...")).not.toBeInTheDocument();
  });

  it("calls toast.error when saving empty note", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<NotesTab client={clientWithNoNotes} />);

    await user.click(screen.getByRole("button", { name: /add note/i }));
    await user.click(screen.getByRole("button", { name: /save note/i }));

    expect(toast.error).toHaveBeenCalledWith("Note cannot be empty");
  });

  it("calls fetch when saving a valid note", async () => {
    const user = userEvent.setup();
    render(<NotesTab client={clientWithNoNotes} />);

    await user.click(screen.getByRole("button", { name: /add note/i }));
    const textarea = screen.getByPlaceholderText("Enter your note here...");
    await user.type(textarea, "This is a new note");
    await user.click(screen.getByRole("button", { name: /save note/i }));

    expect(global.fetch).toHaveBeenCalledWith("/api/notes", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "client-2", text: "This is a new note" }),
    }));
  });

  it("handles string notes as empty (no notes rendered)", () => {
    render(<NotesTab client={clientWithStringNotes} />);
    // String notes parse to empty array
    expect(screen.getByText("No notes recorded for this client")).toBeInTheDocument();
  });
});
