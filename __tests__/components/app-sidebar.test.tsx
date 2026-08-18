import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/app-sidebar";

const mockSession = {
  data: { user: { id: "mgr", name: "Test Manager", role: "manager", firstName: "Test", lastName: "Manager" } },
  status: "authenticated" as const,
};
const mockSignOut = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockSession,
  signOut: (...args: unknown[]) => mockSignOut(...args),
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

describe("AppSidebar account menu", () => {
  it("shows the user's name and role on the footer trigger", () => {
    mockPathname = "/";
    renderSidebar();
    const trigger = screen.getByRole("button", { name: /account menu/i });
    expect(trigger).toHaveTextContent("Test Manager");
    expect(trigger).toHaveTextContent("manager");
  });

  it("opens a menu with a change-password link and sign out", async () => {
    mockPathname = "/";
    renderSidebar();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /account menu/i }));

    const changePassword = await screen.findByRole("menuitem", { name: /change password/i });
    expect(changePassword).toHaveAttribute("href", "/change-password");

    await user.click(screen.getByRole("menuitem", { name: /sign out/i }));
    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});
