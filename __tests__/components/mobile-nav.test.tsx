import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MobileNav } from "@/components/mobile-nav";

let mockPathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

const setOpenMobile = vi.fn();
vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ setOpenMobile }),
}));

function link(label: string) {
  return screen.getByText(label).closest("a")!;
}

function isActive(label: string) {
  return link(label).getAttribute("aria-current") === "page";
}

describe("MobileNav active state", () => {
  it("marks Home active on exact match only", () => {
    mockPathname = "/";
    render(<MobileNav />);
    expect(isActive("Home")).toBe(true);
    expect(isActive("Clients")).toBe(false);
  });

  it("does not mark Home active on every route", () => {
    mockPathname = "/clients";
    render(<MobileNav />);
    expect(isActive("Home")).toBe(false);
    expect(isActive("Clients")).toBe(true);
  });

  it("prefix-matches a client detail route to Clients", () => {
    mockPathname = "/clients/abc-123";
    render(<MobileNav />);
    expect(isActive("Clients")).toBe(true);
  });

  // Regression: the active tab used `text-accent`, which since the stone palette is a
  // neutral surface tint (1.09:1 on light) — fainter than the inactive tabs.
  it("renders the active tab in the foreground colour with a gold indicator", () => {
    mockPathname = "/follow-ups";
    render(<MobileNav />);
    const active = link("Follow").className;
    expect(active).not.toMatch(/\btext-accent\b/);
    expect(active).toContain("text-foreground");
    expect(active).toContain("before:bg-meridian-gold-deep");
    expect(active).toContain("dark:before:bg-meridian-gold");
    expect(link("Home").className).toContain("text-muted-foreground");
    expect(link("Home").className).not.toContain("before:");
  });

  // The one sanctioned size below text-xs: 11px medium labels under the icons.
  it("sets tab labels at 11px medium, not 10px", () => {
    mockPathname = "/";
    render(<MobileNav />);
    for (const label of ["Home", "Clients"]) {
      expect(link(label).className).toContain("text-[11px]");
      expect(link(label).className).toContain("font-medium");
      expect(link(label).className).not.toContain("text-[10px]");
    }
  });
});

describe("MobileNav More", () => {
  // Regression: "More" linked to /settings, so Prospects, Promos and Smart
  // Lists (which live only in the sidebar) were unreachable on a phone.
  it("opens the mobile sidebar sheet instead of navigating", () => {
    setOpenMobile.mockClear();
    mockPathname = "/";
    render(<MobileNav />);
    const more = screen.getByRole("button", { name: "More" });
    expect(more.closest("a")).toBeNull();
    fireEvent.click(more);
    expect(setOpenMobile).toHaveBeenCalledWith(true);
  });

  it("pads the bar by the bottom safe-area inset", () => {
    render(<MobileNav />);
    expect(screen.getByRole("navigation").className).toContain("pb-[env(safe-area-inset-bottom)]");
  });
});
