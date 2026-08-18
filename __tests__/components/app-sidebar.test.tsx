import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/app-sidebar";

const mockSession = {
  data: { user: { id: "mgr", name: "Test Manager", role: "manager", firstName: "Test", lastName: "Manager" } },
  status: "authenticated" as const,
};
vi.mock("next-auth/react", () => ({
  useSession: () => mockSession,
  signOut: vi.fn(),
}));

let mockPathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

function renderSidebar() {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </TooltipProvider>
  );
}

function activeLabel(label: string) {
  const match = screen.getAllByText(label).find((node) => node.closest("a"));
  const el = match?.closest("[data-active]");
  return el?.getAttribute("data-active");
}

describe("AppSidebar active state", () => {
  it("marks Dashboard active on exact match and nothing else", () => {
    mockPathname = "/";
    renderSidebar();
    expect(activeLabel("Dashboard")).toBe("true");
    expect(activeLabel("Client List")).toBe("false");
  });

  it("does not mark Dashboard active on every route", () => {
    mockPathname = "/clients";
    renderSidebar();
    expect(activeLabel("Dashboard")).toBe("false");
    expect(activeLabel("Client List")).toBe("true");
  });

  it("prefix-matches a client detail route to Client List", () => {
    mockPathname = "/clients/abc-123";
    renderSidebar();
    expect(activeLabel("Client List")).toBe("true");
  });

  it("lets the deepest match win between /analytics and /analytics/collections", () => {
    mockPathname = "/analytics/collections";
    renderSidebar();
    expect(activeLabel("Collections")).toBe("true");
    expect(activeLabel("Analytics")).toBe("false");
  });
});
