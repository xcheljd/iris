import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

// Shallow render: every chrome component is stubbed so the test pins only the
// layout's own markup — the inset that page content scrolls in.
const { passthrough, nothing } = vi.hoisted(() => ({
  passthrough: ({ children }: { children?: ReactNode }) => children,
  nothing: () => null,
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: passthrough,
  SidebarInset: ({ className, children }: { className?: string; children?: ReactNode }) => (
    <main data-testid="inset" className={className}>{children}</main>
  ),
}));
vi.mock("@/components/app-sidebar", () => ({ AppSidebar: nothing }));
vi.mock("@/components/command-palette", () => ({ CommandPalette: nothing, CommandPaletteProvider: passthrough }));
vi.mock("@/components/g-nav", () => ({ GNav: nothing }));
vi.mock("@/components/mobile-nav", () => ({ MobileNav: nothing }));
vi.mock("@/components/backup-reminder-dialog", () => ({ BackupReminderDialog: nothing }));
vi.mock("@/components/onboarding", () => ({
  OnboardingProvider: passthrough,
  TourOverlay: nothing,
  TourTooltip: nothing,
  TourErrorBoundary: passthrough,
  ResumeTourButton: nothing,
  HintManager: nothing,
}));
vi.mock("@/components/page-transition-overlay", () => ({ PageTransitionOverlay: nothing }));
vi.mock("@/components/route-fade", () => ({ RouteFade: passthrough }));

import AppLayout from "@/app/(app)/layout";

describe("AppLayout", () => {
  // Regression: MobileNav is fixed to the bottom below md, and nothing padded
  // the content for it, so the last table row and pagination sat underneath.
  it("pads the content inset to clear the fixed mobile nav, and only below md", () => {
    render(<AppLayout><p>page</p></AppLayout>);
    const cls = screen.getByTestId("inset").className;
    expect(cls).toContain("pb-[calc(3.5rem+env(safe-area-inset-bottom))]");
    expect(cls).toContain("md:pb-0");
    expect(screen.getByText("page")).toBeInTheDocument();
  });
});
