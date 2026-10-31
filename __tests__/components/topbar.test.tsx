import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Topbar } from "@/components/topbar";

vi.mock("@/components/ui/sidebar", () => ({ SidebarTrigger: () => null }));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }));
vi.mock("@/components/command-palette", () => ({ useCommandPalette: () => ({ setOpen: vi.fn() }) }));
vi.mock("@/components/navigation-transition", () => ({
  useNavigationTransition: () => ({ state: "idle", targetTitle: null }),
}));

function withUserAgent(ua: string) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
}

describe("Topbar command palette hint", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows Ctrl+K on Windows", () => {
    withUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    render(<Topbar title="Clients" />);
    expect(screen.getByText("Ctrl+K")).toBeInTheDocument();
    expect(screen.queryByText("⌘K")).not.toBeInTheDocument();
  });

  it("shows ⌘K on macOS", () => {
    withUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)");
    render(<Topbar title="Clients" />);
    expect(screen.getByText("⌘K")).toBeInTheDocument();
  });

  it("hides the hint on small screens", () => {
    withUserAgent("Mozilla/5.0 (X11; Linux x86_64)");
    render(<Topbar title="Clients" />);
    expect(screen.getByText("Ctrl+K")).toHaveClass("hidden", "sm:inline-flex");
  });
});

// Phones (<md) have no top bar: the bottom tab bar's More opens the menu,
// search floats top-right, the theme switch lives in More. Desktop unchanged.
describe("Topbar on phones", () => {
  it("keeps the page heading but hides menu, search and theme controls below md", () => {
    render(<Topbar title="Clients" />);
    expect(screen.getByRole("banner")).not.toHaveClass("max-md:hidden");
    expect(screen.getByRole("banner")).toHaveClass("md:sticky");
    expect(screen.getByRole("button", { name: "Toggle theme" })).toHaveClass("max-md:hidden");
    expect(screen.getByText("Search").closest("button")).toHaveClass("max-md:hidden");
  });

  it("drops the heading row on detail pages (phoneHeader={false})", () => {
    render(<Topbar title="Grace Liu" phoneHeader={false} />);
    expect(screen.getByRole("banner")).toHaveClass("max-md:hidden");
  });
});
