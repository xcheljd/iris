import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import React from "react";

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockSession = {
  data: {
    user: { id: "test-user-id", name: "Test User", role: "associate" as const, firstName: "Test", lastName: "User" },
  },
  status: "authenticated" as const,
};
vi.mock("next-auth/react", () => ({
  useSession: () => mockSession,
}));

const mockReplace = vi.fn();
let mockPathname = "/";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => mockPathname,
}));

let mockOnboardingState: any = null;
vi.mock("@/lib/actions/onboarding", () => ({
  getOnboardingState: vi.fn(() => Promise.resolve(mockOnboardingState)),
  updateOnboardingState: vi.fn(() => Promise.resolve({
    tourCompleted: false, currentStep: 0, completedSteps: [], hintsDismissed: [], tourSkipped: false,
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────

import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { TourTooltip } from "@/components/onboarding/tour-tooltip";

function renderTooltip() {
  return render(
    <OnboardingProvider>
      <TourTooltip />
    </OnboardingProvider>,
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("TourTooltip MutationObserver polling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnboardingState = null;
    mockPathname = "/";
    mockSession.data.user.role = "associate";
    Object.defineProperty(window, "innerWidth", { value: 1024, writable: true, configurable: true });
  });

  afterEach(() => {
    // Clean up any leftover DOM elements
    document.querySelectorAll("[data-tour]").forEach((el) => el.remove());
  });

  it("shows 'Loading step...' while waiting for target element to appear", async () => {
    mockOnboardingState = {
      tourCompleted: false,
      currentStep: 2, // dashboard step — has target selector
      completedSteps: ["welcome"],
      hintsDismissed: [],
      tourSkipped: false,
    };

    renderTooltip();

    // Wait for the loading indicator to appear (tour needs to become active + 120ms initial delay)
    await waitFor(() => {
      expect(screen.queryByText("Loading step...")).toBeTruthy();
    }, { timeout: 2000 });
  });

  it("finds target element after it appears in DOM via MutationObserver", async () => {
    mockOnboardingState = {
      tourCompleted: false,
      currentStep: 2, // dashboard step — target is [data-tour='dashboard-stats']
      completedSteps: ["welcome"],
      hintsDismissed: [],
      tourSkipped: false,
    };

    renderTooltip();

    // Wait for loading indicator
    await waitFor(() => {
      expect(screen.queryByText("Loading step...")).toBeTruthy();
    }, { timeout: 2000 });

    // Now add the target element to the DOM (simulating page navigation completing)
    await act(async () => {
      const targetEl = document.createElement("div");
      targetEl.setAttribute("data-tour", "dashboard-stats");
      targetEl.getBoundingClientRect = () => ({
        top: 100, left: 100, width: 200, height: 50, right: 300, bottom: 150, x: 100, y: 100,
        toJSON: () => ({}),
      });
      targetEl.scrollIntoView = vi.fn();
      document.body.appendChild(targetEl);
    });

    // Wait for the MutationObserver to detect the element and show the tooltip
    await waitFor(() => {
      expect(screen.queryByText("Dashboard")).toBeTruthy();
    }, { timeout: 2000 });

    // Loading state should be gone
    expect(screen.queryByText("Loading step...")).toBeFalsy();
  });

  it("skips step after 2s timeout if target element never appears", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockOnboardingState = {
      tourCompleted: false,
      currentStep: 2, // dashboard step
      completedSteps: ["welcome"],
      hintsDismissed: [],
      tourSkipped: false,
    };

    renderTooltip();

    // Wait for loading indicator
    await waitFor(() => {
      expect(screen.queryByText("Loading step...")).toBeTruthy();
    }, { timeout: 2000 });

    // Wait for the 2s timeout to elapse (2s polling + buffer)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2500));
    });

    // Should have logged a warning about skipping
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("not found after 2s"),
    );

    consoleWarnSpy.mockRestore();
  });

  it("does not show loading for welcome step (no target selector)", async () => {
    mockOnboardingState = {
      tourCompleted: false,
      currentStep: 1,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };

    renderTooltip();

    // Welcome step renders immediately as a dialog — no loading state
    await waitFor(() => {
      expect(screen.queryByText("Welcome to Iris!")).toBeTruthy();
    }, { timeout: 2000 });

    expect(screen.queryByText("Loading step...")).toBeFalsy();
  });

  it("tooltip measures target element correctly after DOM insertion", async () => {
    mockOnboardingState = {
      tourCompleted: false,
      currentStep: 4, // client-list step — target is [data-tour='client-list']
      completedSteps: ["welcome", "dashboard", "sidebar"],
      hintsDismissed: [],
      tourSkipped: false,
    };

    renderTooltip();

    // Wait for loading indicator
    await waitFor(() => {
      expect(screen.queryByText("Loading step...")).toBeTruthy();
    }, { timeout: 2000 });

    // Add target with specific position
    await act(async () => {
      const targetEl = document.createElement("div");
      targetEl.setAttribute("data-tour", "client-list");
      targetEl.getBoundingClientRect = () => ({
        top: 200, left: 50, width: 400, height: 300, right: 450, bottom: 500, x: 50, y: 200,
        toJSON: () => ({}),
      });
      targetEl.scrollIntoView = vi.fn();
      document.body.appendChild(targetEl);
    });

    // Wait for the tooltip to appear with the step content
    await waitFor(() => {
      expect(screen.queryByText("Client List")).toBeTruthy();
    }, { timeout: 2000 });

    // Loading should be gone
    expect(screen.queryByText("Loading step...")).toBeFalsy();
  });
});
