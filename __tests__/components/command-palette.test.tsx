import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette } from "@/components/command-palette";

const mockPush = vi.fn();

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({
    data: { user: { id: "mgr", name: "Test Manager", role: "manager" } },
  })),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: mockPush, refresh: vi.fn() })),
  usePathname: vi.fn(() => "/"),
}));

// Mock the Dialog-based CommandDialog to be simpler for testing
// We need to mock cmdk because it uses complex portal/radix internals
vi.mock("@/components/ui/command", () => {
  return {
    CommandDialog: ({ children, open, onOpenChange }: { children: React.ReactNode; open: boolean; onOpenChange: (open: boolean) => void }) => {
      if (!open) return null;
      return (
        <div data-testid="command-dialog" aria-label="Command Palette">
          <button data-testid="close-dialog" onClick={() => onOpenChange(false)}>Close</button>
          {children}
        </div>
      );
    },
    CommandInput: ({ placeholder, value, onValueChange }: { placeholder: string; value: string; onValueChange: (v: string) => void }) => (
      <input
        data-testid="command-input"
        placeholder={placeholder}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onValueChange(e.target.value)}
      />
    ),
    CommandList: ({ children }: { children: React.ReactNode }) => <div data-testid="command-list">{children}</div>,
    CommandEmpty: ({ children }: { children: React.ReactNode }) => <div data-testid="command-empty">{children}</div>,
    CommandGroup: ({ children, heading }: { children: React.ReactNode; heading?: string }) => (
      <div data-testid="command-group">
        {heading && <div data-testid="group-heading">{heading}</div>}
        {children}
      </div>
    ),
    CommandItem: ({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) => (
      <div data-testid="command-item" role="option" aria-selected={false} onClick={onSelect}>{children}</div>
    ),
    CommandSeparator: () => <hr />,
  };
});

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: "c1", firstName: "Alice", lastName: "Anderson", phone: "555-0001" },
            { id: "c2", firstName: "Bob", lastName: "Brown", phone: "555-0002" },
          ]),
      } as Response)
    ) as unknown as typeof fetch;
  });

  it("renders the command palette component (initially closed)", () => {
    render(<CommandPalette />);
    // The dialog should not be visible initially
    expect(screen.queryByTestId("command-dialog")).not.toBeInTheDocument();
  });

  it("opens the dialog on Ctrl+K keyboard shortcut", async () => {
    render(<CommandPalette />);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    });
    expect(screen.getByTestId("command-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("command-input")).toBeInTheDocument();
  });

  it("shows the search input with placeholder", async () => {
    render(<CommandPalette />);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    });
    expect(screen.getByPlaceholderText("Search clients, jump to pages...")).toBeInTheDocument();
  });

  it("displays navigation items when open", async () => {
    render(<CommandPalette />);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    });
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Clients")).toBeInTheDocument();
    expect(screen.getByText("Follow-Ups")).toBeInTheDocument();
    expect(screen.getByText("Promos")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("displays all expected navigation items", async () => {
    render(<CommandPalette />);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    });
    const navItems = ["Dashboard", "Clients", "Follow-Ups", "Smart Lists", "Promos", "Analytics", "Banned", "Unsubscribed", "Settings"];
    for (const item of navItems) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });

  it("shows 'No results.' empty state text", async () => {
    render(<CommandPalette />);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    });
    expect(screen.getByText("No results.")).toBeInTheDocument();
  });

  it("has a New Client action", async () => {
    render(<CommandPalette />);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    });
    expect(screen.getByText("New Client")).toBeInTheDocument();
  });

  it("fetches client search results when typing in the search box", async () => {
    render(<CommandPalette />);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    });
    const input = screen.getByTestId("command-input");
    await userEvent.type(input, "Ali");
    // Wait for the debounce timeout
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/search?q=Ali"));
  });

  it("navigates when clicking a nav item", async () => {
    render(<CommandPalette />);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    });
    // Click on the Clients nav item
    const clientsItem = screen.getByText("Clients");
    // The click handler is on the parent CommandItem div
    const commandItem = clientsItem.closest('[data-testid="command-item"]') as HTMLElement;
    expect(commandItem).toBeTruthy();
    await userEvent.click(commandItem!);
    expect(mockPush).toHaveBeenCalledWith("/clients");
  });

  it("closes the dialog when close button is clicked", async () => {
    render(<CommandPalette />);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    });
    expect(screen.getByTestId("command-dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("close-dialog"));
    expect(screen.queryByTestId("command-dialog")).not.toBeInTheDocument();
  });
});
