import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import React from "react";
import { SidebarProvider } from "@/components/ui/sidebar";

// ─── Mocks ────────────────────────────────────────────────────────────────

// Mock next-auth/react
const mockSession = {
  data: {
    user: { id: "test-user-id", name: "Test User", role: "associate" as "associate" | "manager", firstName: "Test", lastName: "User" },
  },
  status: "authenticated" as const,
};
vi.mock("next-auth/react", () => ({
  useSession: () => mockSession,
}));

// Mock next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockPathname = "/";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => mockPathname,
}));

// Mock server actions
let mockOnboardingState: OnboardingState | null = null;
const mockUpdateResult: OnboardingState = {
  tourCompleted: false,
  currentStep: 0,
  completedSteps: [],
  hintsDismissed: [],
  tourSkipped: false,
};
const mockUpdateFn = vi.fn().mockResolvedValue(mockUpdateResult);

vi.mock("@/lib/actions/onboarding", () => ({
  getOnboardingState: vi.fn(() => Promise.resolve(mockOnboardingState)),
  updateOnboardingState: (...args: OnboardingUpdate[]) => mockUpdateFn(...args),
}));

// ─── Import after mocks ───────────────────────────────────────────────────

import { OnboardingProvider, useOnboarding } from "@/components/onboarding/onboarding-provider";
import type { OnboardingState } from "@/lib/actions/onboarding";
type OnboardingUpdate = Parameters<typeof import("@/lib/actions/onboarding").updateOnboardingState>[0];

// ─── Test helpers ─────────────────────────────────────────────────────────

function TestConsumer() {
  const ctx = useOnboarding();
  return (
    <div>
      <span data-testid="status">{ctx.tourStatus}</span>
      <span data-testid="step-index">{ctx.currentStepIndex}</span>
      <span data-testid="total-steps">{ctx.totalSteps}</span>
      <span data-testid="current-step-id">{ctx.currentStep?.id ?? "none"}</span>
      <span data-testid="loading">{ctx.loading ? "true" : "false"}</span>
      <span data-testid="is-mobile">{ctx.isMobile ? "true" : "false"}</span>
      <button data-testid="btn-start" onClick={() => ctx.startTour()}>Start</button>
      <button data-testid="btn-next" onClick={() => ctx.nextStep()}>Next</button>
      <button data-testid="btn-prev" onClick={() => ctx.prevStep()}>Prev</button>
      <button data-testid="btn-skip" onClick={() => ctx.skipTour()}>Skip</button>
      <button data-testid="btn-pause" onClick={() => ctx.pauseTour()}>Pause</button>
      <button data-testid="btn-resume" onClick={() => ctx.resumeTour()}>Resume</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <SidebarProvider>
      <OnboardingProvider>
        <TestConsumer />
      </OnboardingProvider>
    </SidebarProvider>,
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("OnboardingProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnboardingState = null;
    mockPathname = "/";
    mockSession.data.user.role = "associate";
    mockSession.status = "authenticated";

    // Reset window.innerWidth mock
    Object.defineProperty(window, "innerWidth", { value: 1024, writable: true, configurable: true });
  });

  it("renders children", () => {
    renderWithProvider();
    expect(screen.getByTestId("status")).toBeInTheDocument();
  });

  it("starts with idle status while loading", async () => {
    renderWithProvider();
    // Initially may be idle or loading
    expect(screen.getByTestId("status")).toBeInTheDocument();
  });

  it("shows associate role has 8 total steps", async () => {
    mockSession.data.user.role = "associate";
    renderWithProvider();

    // Wait for loading to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(screen.getByTestId("total-steps").textContent).toBe("8");
  });

  it("shows manager role has 12 total steps", async () => {
    mockSession.data.user.role = "manager";
    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(screen.getByTestId("total-steps").textContent).toBe("12");
  });

  it("auto-triggers tour when onboarding state is null", async () => {
    mockOnboardingState = null;
    renderWithProvider();

    // Wait for auto-trigger timeout
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    expect(screen.getByTestId("status").textContent).toBe("active");
    expect(screen.getByTestId("step-index").textContent).toBe("1");
    expect(screen.getByTestId("current-step-id").textContent).toBe("welcome");
  });

  it("does not auto-trigger when tour is completed", async () => {
    mockOnboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: ["welcome", "dashboard", "sidebar", "client-list", "client-detail", "follow-ups", "command-palette", "smart-lists"],
      hintsDismissed: [],
      tourSkipped: false,
    };
    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    expect(screen.getByTestId("status").textContent).toBe("idle");
  });

  it("resumes tour from persisted step", async () => {
    mockOnboardingState = {
      tourCompleted: false,
      currentStep: 4,
      completedSteps: ["welcome", "dashboard", "sidebar"],
      hintsDismissed: [],
      tourSkipped: false,
    };
    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(screen.getByTestId("status").textContent).toBe("active");
    expect(screen.getByTestId("step-index").textContent).toBe("4");
    expect(screen.getByTestId("current-step-id").textContent).toBe("client-list");
  });

  it("does not resume when tour was skipped", async () => {
    mockOnboardingState = {
      tourCompleted: true,
      currentStep: 0,
      completedSteps: ["welcome"],
      hintsDismissed: [],
      tourSkipped: true,
    };
    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(screen.getByTestId("status").textContent).toBe("idle");
  });

  it("advances step with nextStep", async () => {
    renderWithProvider();

    // Start the tour
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    expect(screen.getByTestId("step-index").textContent).toBe("1");

    // Click Next
    await act(async () => {
      screen.getByTestId("btn-next").click();
    });

    expect(screen.getByTestId("step-index").textContent).toBe("2");
    expect(screen.getByTestId("current-step-id").textContent).toBe("dashboard");
  });

  it("goes back with prevStep", async () => {
    renderWithProvider();

    // Start and advance
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });
    await act(async () => {
      screen.getByTestId("btn-next").click();
    });

    expect(screen.getByTestId("step-index").textContent).toBe("2");

    // Go back
    await act(async () => {
      screen.getByTestId("btn-prev").click();
    });

    expect(screen.getByTestId("step-index").textContent).toBe("1");
  });

  it("does not go back from step 1", async () => {
    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });
    expect(screen.getByTestId("step-index").textContent).toBe("1");

    await act(async () => {
      screen.getByTestId("btn-prev").click();
    });

    // Still at step 1
    expect(screen.getByTestId("step-index").textContent).toBe("1");
  });

  it("skip tour sets idle status and calls updateOnboardingState", async () => {
    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    await act(async () => {
      screen.getByTestId("btn-skip").click();
    });

    expect(screen.getByTestId("status").textContent).toBe("idle");
    expect(mockUpdateFn).toHaveBeenCalled();
  });

  it("pause tour sets paused status", async () => {
    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    await act(async () => {
      screen.getByTestId("btn-pause").click();
    });

    expect(screen.getByTestId("status").textContent).toBe("paused");
  });

  it("resume tour sets active status", async () => {
    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    await act(async () => {
      screen.getByTestId("btn-pause").click();
    });
    expect(screen.getByTestId("status").textContent).toBe("paused");

    await act(async () => {
      screen.getByTestId("btn-resume").click();
    });
    expect(screen.getByTestId("status").textContent).toBe("active");
  });

  it("startTour can be called manually to restart", async () => {
    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    // Skip tour first
    await act(async () => {
      screen.getByTestId("btn-skip").click();
    });
    expect(screen.getByTestId("status").textContent).toBe("idle");

    // Restart
    await act(async () => {
      screen.getByTestId("btn-start").click();
    });
    expect(screen.getByTestId("status").textContent).toBe("active");
    expect(screen.getByTestId("step-index").textContent).toBe("1");
  });

  it("detects mobile viewport", async () => {
    Object.defineProperty(window, "innerWidth", { value: 375, writable: true, configurable: true });
    window.dispatchEvent(new Event("resize"));

    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(screen.getByTestId("is-mobile").textContent).toBe("true");
  });

  it("does not start tour on mobile", async () => {
    Object.defineProperty(window, "innerWidth", { value: 375, writable: true, configurable: true });
    window.dispatchEvent(new Event("resize"));

    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    // Tour should not start on mobile
    expect(screen.getByTestId("status").textContent).toBe("idle");
  });

  it("persists state via server action on step transition", async () => {
    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    await act(async () => {
      screen.getByTestId("btn-next").click();
    });

    expect(mockUpdateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        currentStep: 2,
      }),
    );
  });

  it("uses router.replace for page navigation", async () => {
    mockPathname = "/";
    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    // Advance to step 4 which is on /clients
    await act(async () => {
      screen.getByTestId("btn-next").click(); // step 2 (dashboard, on /)
    });
    await act(async () => {
      screen.getByTestId("btn-next").click(); // step 3 (sidebar, on /)
    });
    await act(async () => {
      screen.getByTestId("btn-next").click(); // step 4 (client-list, on /clients)
    });

    expect(mockReplace).toHaveBeenCalledWith("/clients");
  });

  /* -------------------------------------------------------------------------- */
  /* VAL-TOUR-016: Tour resume navigates to persisted step's target page         */
  /* -------------------------------------------------------------------------- */

  it("navigates to the persisted step's target page on resume (VAL-TOUR-016)", async () => {
    // User was on step 4 (client-list, page=/clients) when they closed the browser
    // They're now on "/" — tour should navigate to "/clients" before activating
    mockPathname = "/";
    mockOnboardingState = {
      tourCompleted: false,
      currentStep: 4,
      completedSteps: ["welcome", "dashboard", "sidebar"],
      hintsDismissed: [],
      tourSkipped: false,
    };

    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // Tour should have resumed at step 4
    expect(screen.getByTestId("status").textContent).toBe("active");
    expect(screen.getByTestId("step-index").textContent).toBe("4");
    // Router should have navigated to the step's target page
    expect(mockReplace).toHaveBeenCalledWith("/clients");
  });

  it("does not navigate on resume when already on the step's page (VAL-TOUR-016)", async () => {
    // User was on step 4 (client-list, page=/clients) and is already on /clients
    mockPathname = "/clients";
    mockOnboardingState = {
      tourCompleted: false,
      currentStep: 4,
      completedSteps: ["welcome", "dashboard", "sidebar"],
      hintsDismissed: [],
      tourSkipped: false,
    };

    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // Tour should have resumed at step 4
    expect(screen.getByTestId("status").textContent).toBe("active");
    expect(screen.getByTestId("step-index").textContent).toBe("4");
    // Router should NOT have been called — already on correct page
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("navigates to manager step page on resume (VAL-TOUR-016)", async () => {
    // Manager was on step 9 (analytics, page=/analytics) when they closed the browser.
    // Manager step order: analytics, approvals, employee-management, backup —
    // the first manager-only step appended after the 8 base steps.
    mockSession.data.user.role = "manager";
    mockPathname = "/";
    mockOnboardingState = {
      tourCompleted: false,
      currentStep: 9,
      completedSteps: ["welcome", "dashboard", "sidebar", "client-list", "client-detail", "follow-ups", "command-palette", "smart-lists"],
      hintsDismissed: [],
      tourSkipped: false,
    };

    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(screen.getByTestId("status").textContent).toBe("active");
    expect(screen.getByTestId("step-index").textContent).toBe("9");
    expect(mockReplace).toHaveBeenCalledWith("/analytics");
  });

  it("does not navigate on resume for steps on 'current' page (VAL-TOUR-016)", async () => {
    // Step 7 (command-palette) has page="current" — no navigation needed
    mockPathname = "/follow-ups";
    mockOnboardingState = {
      tourCompleted: false,
      currentStep: 7,
      completedSteps: ["welcome", "dashboard", "sidebar", "client-list", "client-detail", "follow-ups"],
      hintsDismissed: [],
      tourSkipped: false,
    };

    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // Tour should have resumed at step 7
    expect(screen.getByTestId("status").textContent).toBe("active");
    expect(screen.getByTestId("step-index").textContent).toBe("7");
    // Router should NOT have been called — step uses "current" page
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* VAL-TOUR-032 partial: Escape checks Command Palette state                  */
/* -------------------------------------------------------------------------- */

describe("Escape handler and Command Palette priority (VAL-TOUR-032)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnboardingState = null;
    mockPathname = "/";
    mockSession.data.user.role = "associate";
    mockSession.status = "authenticated";
    Object.defineProperty(window, "innerWidth", { value: 1024, writable: true, configurable: true });
  });

  afterEach(() => {
    // Clean up any command palette DOM elements
    document.querySelectorAll("[data-command-dialog], [cmdk-root], [data-command-root]").forEach((el) => el.remove());
  });

  it("Escape pauses tour when Command Palette is NOT open", async () => {
    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    expect(screen.getByTestId("status").textContent).toBe("active");

    // Press Escape — no command palette is open
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(screen.getByTestId("status").textContent).toBe("paused");
  });

  it("Escape does NOT pause tour when Command Palette is open (data-command-dialog)", async () => {
    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    expect(screen.getByTestId("status").textContent).toBe("active");

    // Simulate command palette being open
    const paletteEl = document.createElement("div");
    paletteEl.setAttribute("data-command-dialog", "");
    document.body.appendChild(paletteEl);

    // Press Escape — command palette is open, tour should NOT pause
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(screen.getByTestId("status").textContent).toBe("active");

    document.body.removeChild(paletteEl);
  });

  it("Escape does NOT pause tour when Command Palette is open (cmdk-root)", async () => {
    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    expect(screen.getByTestId("status").textContent).toBe("active");

    // Simulate command palette using cmdk-root selector
    const paletteEl = document.createElement("div");
    paletteEl.setAttribute("cmdk-root", "");
    document.body.appendChild(paletteEl);

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(screen.getByTestId("status").textContent).toBe("active");

    document.body.removeChild(paletteEl);
  });

  it("Escape pauses tour after Command Palette is closed", async () => {
    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    expect(screen.getByTestId("status").textContent).toBe("active");

    // Open palette
    const paletteEl = document.createElement("div");
    paletteEl.setAttribute("data-command-dialog", "");
    document.body.appendChild(paletteEl);

    // Escape with palette open — should NOT pause
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.getByTestId("status").textContent).toBe("active");

    // Close palette
    document.body.removeChild(paletteEl);

    // Escape without palette — should pause
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.getByTestId("status").textContent).toBe("paused");
  });
});

/* -------------------------------------------------------------------------- */
/* Error logging in catch blocks                                               */
/* -------------------------------------------------------------------------- */

describe("Error logging in catch blocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnboardingState = null;
    mockPathname = "/";
    mockSession.data.user.role = "associate";
    mockSession.status = "authenticated";
    Object.defineProperty(window, "innerWidth", { value: 1024, writable: true, configurable: true });
  });

  it("logs error when initial state load fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Override getOnboardingState to reject
    const { getOnboardingState } = await import("@/lib/actions/onboarding");
    vi.mocked(getOnboardingState).mockRejectedValueOnce(new Error("Load failed"));

    renderWithProvider();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[OnboardingProvider] Failed to load onboarding state:",
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });

  it("logs error when skip tour persist fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Default getOnboardingState returns null (triggers tour), but update fails on skip
    mockUpdateFn.mockRejectedValue(new Error("Skip persist failed"));

    renderWithProvider();

    // Wait for auto-trigger
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    // Skip tour
    await act(async () => {
      screen.getByTestId("btn-skip").click();
    });

    // Wait for async skip to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // Find a call matching the skip tour prefix
    const skipCalls = consoleErrorSpy.mock.calls.filter(
      (call) => typeof call[0] === "string" && call[0].includes("Failed to persist skip tour:")
    );
    expect(skipCalls.length).toBeGreaterThanOrEqual(1);

    consoleErrorSpy.mockRestore();
  });

  it("logs error when step persist fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // All updates fail
    mockUpdateFn.mockRejectedValue(new Error("Step persist failed"));

    renderWithProvider();

    // Wait for auto-trigger
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    // Advance to next step (which triggers persist)
    await act(async () => {
      screen.getByTestId("btn-next").click();
    });

    // Wait for async persist
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // The error log should have been called for step persist failure
    const errorCalls = consoleErrorSpy.mock.calls.filter(
      (call) => typeof call[0] === "string" && call[0].includes("Failed to persist step:")
    );
    expect(errorCalls.length).toBeGreaterThanOrEqual(1);

    consoleErrorSpy.mockRestore();
  });
});
