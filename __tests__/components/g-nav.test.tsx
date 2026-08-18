import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { GNav } from "@/components/g-nav";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn(), prefetch: vi.fn() }),
}));

let mockSession: { data: unknown; status: string } = {
  data: { user: { id: "assoc", name: "Test Associate", role: "associate" } },
  status: "authenticated",
};
vi.mock("next-auth/react", () => ({
  useSession: () => mockSession,
}));

const setRole = (role: string) => {
  mockSession = { data: { user: { id: "u1", name: "Test User", role } }, status: "authenticated" };
};

const pressG = () => fireEvent.keyDown(window, { key: "g" });
const press = (key: string) => fireEvent.keyDown(window, { key });

describe("GNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRole("associate");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const nonManagerMap: Array<[string, string]> = [
    ["d", "/"],
    ["c", "/clients"],
    ["p", "/prospects"],
    ["f", "/follow-ups"],
    ["l", "/smart-lists"],
    ["t", "/promos"],
    ["a", "/analytics"],
    ["w", "/analytics/collections"],
    ["b", "/banned"],
    ["u", "/unsubscribed"],
    ["s", "/settings"],
  ];

  it.each(nonManagerMap)("navigates on g %s -> %s", (key, href) => {
    render(<GNav />);
    pressG();
    press(key);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(href);
  });

  it("navigates to the dashboard on g g", () => {
    render(<GNav />);
    pressG();
    pressG();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("Escape cancels the chord", () => {
    render(<GNav />);
    pressG();
    press("Escape");
    press("c");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("an unknown printable key disarms", () => {
    render(<GNav />);
    pressG();
    press("z");
    press("c");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("ignores keys typed inside an input", () => {
    render(
      <>
        <input aria-label="notes" />
        <GNav />
      </>
    );
    const input = screen.getByLabelText("notes");
    input.focus();
    fireEvent.keyDown(input, { key: "g" });
    fireEvent.keyDown(input, { key: "c" });
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByText("Clients")).not.toBeInTheDocument();
  });

  it("ignores keys while a dialog is open", () => {
    render(
      <>
        <div role="dialog" data-state="open" />
        <GNav />
      </>
    );
    pressG();
    press("c");
    expect(mockPush).not.toHaveBeenCalled();
  });

  describe("open-surface guard (cline follow-up)", () => {
    it("ignores chords while an AlertDialog (alertdialog role) is open", () => {
      render(
        <>
          <div role="alertdialog" data-state="open" />
          <GNav />
        </>
      );
      pressG();
      press("c");
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("ignores chords while a Radix Select (combobox) is open", () => {
      render(
        <>
          <div role="combobox" data-state="open" />
          <GNav />
        </>
      );
      pressG();
      press("c");
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("ignores chords while a listbox dropdown is mounted", () => {
      render(
        <>
          <ul role="listbox" />
          <GNav />
        </>
      );
      pressG();
      press("c");
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("ignores chords while a non-Radix aria-modal tour is open", () => {
      render(
        <>
          <div role="dialog" aria-modal="true" />
          <GNav />
        </>
      );
      pressG();
      press("c");
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  it("disarms an in-flight chord when a modifier shortcut is pressed", () => {
    render(<GNav />);
    pressG();
    // Cmd+K mid-chord: modifier press resets the chord
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    press("c");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("arms and navigates with Shift held (normalizes case)", () => {
    render(<GNav />);
    fireEvent.keyDown(window, { key: "G", shiftKey: true });
    fireEvent.keyDown(window, { key: "C", shiftKey: true });
    expect(mockPush).toHaveBeenCalledWith("/clients");
  });

  it("ignores key auto-repeat (e.repeat) on the arm key", () => {
    render(<GNav />);
    fireEvent.keyDown(window, { key: "g" });
    // held-g repeats must not re-trigger / double-schedule
    fireEvent.keyDown(window, { key: "g", repeat: true });
    fireEvent.keyDown(window, { key: "c" });
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/clients");
  });

  it("ignores chords with meta/ctrl/alt held", () => {
    render(<GNav />);
    fireEvent.keyDown(window, { key: "g", ctrlKey: true });
    press("c");
    expect(mockPush).not.toHaveBeenCalled();
  });

  describe("manager gating", () => {
    it("treats m and r as unknown for associates", () => {
      render(<GNav />);
      pressG();
      press("m");
      pressG();
      press("r");
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("navigates m -> /catalog and r -> /approvals for managers", () => {
      setRole("manager");
      render(<GNav />);
      pressG();
      press("m");
      pressG();
      press("r");
      expect(mockPush).toHaveBeenNthCalledWith(1, "/catalog");
      expect(mockPush).toHaveBeenNthCalledWith(2, "/approvals");
    });
  });

  it("disarms after 2 seconds and removes the hint pill", () => {
    vi.useFakeTimers();
    render(<GNav />);
    pressG();
    expect(screen.getByText("Clients")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText("Clients")).not.toBeInTheDocument();
    press("c");
    expect(mockPush).not.toHaveBeenCalled();
  });

  describe("hint pill", () => {
    it("is absent from the DOM when not armed", () => {
      render(<GNav />);
      expect(screen.queryByText("Clients")).not.toBeInTheDocument();
    });

    it("lists non-manager destinations only for associates", () => {
      render(<GNav />);
      pressG();
      for (const label of ["Dashboard", "Clients", "Prospects", "Follow-Ups", "Smart Lists", "Promos", "Analytics", "Collections", "Banned", "Unsubscribed", "Settings"]) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
      expect(screen.queryByText("Catalog")).not.toBeInTheDocument();
      expect(screen.queryByText("Approvals")).not.toBeInTheDocument();
    });

    it("includes manager-only destinations for managers", () => {
      setRole("manager");
      render(<GNav />);
      pressG();
      expect(screen.getByText("Catalog")).toBeInTheDocument();
      expect(screen.getByText("Approvals")).toBeInTheDocument();
    });
  });
});
