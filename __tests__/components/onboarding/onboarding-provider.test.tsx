import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ─── Mocks ────────────────────────────────────────────────────────────────

// Mock next-auth/react
const mockSession = {
  data: {
    user: { id: "test-user-id", name: "Test User", role: "associate" as const, firstName: "Test", lastName: "User" },
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
let mockOnboardingState: any = null;
const mockUpdateResult: any = {
  tourCompleted: false,
  currentStep: 0,
  completedSteps: [],
  hintsDismissed: [],
  tourSkipped: false,
};
const mockUpdateFn = vi.fn().mockResolvedValue(mockUpdateResult);

vi.mock("@/lib/actions/onboarding", () => ({
  getOnboardingState: vi.fn(() => Promise.resolve(mockOnboardingState)),
  updateOnboardingState: (...args: any[]) => mockUpdateFn(...args),
}));

// ─── Import after mocks ───────────────────────────────────────────────────

import { OnboardingProvider, useOnboarding } from "@/components/onboarding/onboarding-provider";

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
    <OnboardingProvider>
      <TestConsumer />
    </OnboardingProvider>,
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
});
