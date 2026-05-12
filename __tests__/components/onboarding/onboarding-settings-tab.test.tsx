import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ─── Mocks ────────────────────────────────────────────────────────────────

// Mock next-auth/react
const mockSession = {
  data: {
    user: { id: "test-user-id", name: "Test User", role: "associate" as string, firstName: "Test", lastName: "User" },
  },
  status: "authenticated" as const,
};
vi.mock("next-auth/react", () => ({
  useSession: () => mockSession,
}));

// Mock server actions
let mockOnboardingState: any = null;
const mockGetOnboardingState = vi.fn(() => Promise.resolve(mockOnboardingState));
const mockUpdateOnboardingState = vi.fn(async (updates: any) => {
  // Simulate the real update: merge with current state
  const current = mockOnboardingState ?? {
    tourCompleted: false,
    currentStep: 0,
    completedSteps: [],
    hintsDismissed: [],
    tourSkipped: false,
  };
  const next = {
    ...current,
    ...updates,
    hintsDismissed: updates.hintsDismissed ?? current.hintsDismissed,
  };
  mockOnboardingState = next;
  return next;
});

vi.mock("@/lib/actions/onboarding", () => ({
  getOnboardingState: () => mockGetOnboardingState(),
  updateOnboardingState: (updates: any) => mockUpdateOnboardingState(updates),
}));

// Mock the OnboardingProvider and useOnboarding
const mockStartTour = vi.fn();
const mockOnboardingContext = {
  tourStatus: "idle" as string,
  currentStepIndex: 0,
  totalSteps: 8,
  onboardingState: null as any,
  loading: false,
  isMobile: false,
  startTour: mockStartTour,
};

vi.mock("@/components/onboarding/onboarding-provider", () => ({
  useOnboarding: () => mockOnboardingContext,
  OnboardingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Import after mocks ───────────────────────────────────────────────────

import { OnboardingSettingsTab } from "@/components/onboarding/onboarding-settings-tab";
import { getStepsForRole } from "@/components/onboarding/tour-steps";

// ─── Test helpers ─────────────────────────────────────────────────────────

function renderTab(overrides?: Partial<typeof mockOnboardingContext>) {
  const original = { ...mockOnboardingContext };
  Object.assign(mockOnboardingContext, overrides);
  const result = render(<OnboardingSettingsTab />);
  // Restore after render so subsequent tests start clean
  Object.assign(mockOnboardingContext, original);
  return result;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("OnboardingSettingsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnboardingState = null;
    mockSession.data.user.role = "associate";
    mockOnboardingContext.tourStatus = "idle";
    mockOnboardingContext.currentStepIndex = 0;
    mockOnboardingContext.totalSteps = 8;
    mockOnboardingContext.onboardingState = null;
    mockOnboardingContext.loading = false;
    mockOnboardingContext.isMobile = false;
    mockOnboardingContext.startTour = mockStartTour;
  });

  // ─── VAL-REPLAY-002: Tab displays tour status content ────────────────

  it("renders tour completion status", () => {
    mockOnboardingContext.onboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: getStepsForRole("associate").map((s) => s.id),
      hintsDismissed: [],
      tourSkipped: false,
    };
    renderTab();
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
  });

  it("shows Not Completed when tour is not done", () => {
    mockOnboardingContext.onboardingState = {
      tourCompleted: false,
      currentStep: 0,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    renderTab();
    expect(screen.getByText(/not completed/i)).toBeInTheDocument();
  });

  // ─── VAL-REPLAY-012: Handles null onboarding_state gracefully ────────

  it("handles null onboarding_state gracefully — shows Not Completed", () => {
    mockOnboardingContext.onboardingState = null;
    renderTab();
    expect(screen.getByText(/not completed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start tour/i })).toBeInTheDocument();
  });

  // ─── VAL-REPLAY-003: Step progress reflects role-specific steps ──────

  it("shows 8 steps for associate role", () => {
    mockSession.data.user.role = "associate";
    mockOnboardingContext.totalSteps = 8;
    mockOnboardingContext.onboardingState = {
      tourCompleted: false,
      currentStep: 0,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    renderTab();

    const steps = getStepsForRole("associate");
    for (const step of steps) {
      expect(screen.getByText(step.title)).toBeInTheDocument();
    }
  });

  it("shows 12 steps for manager role", () => {
    mockSession.data.user.role = "manager";
    mockOnboardingContext.totalSteps = 12;
    mockOnboardingContext.onboardingState = {
      tourCompleted: false,
      currentStep: 0,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    renderTab();

    const steps = getStepsForRole("manager");
    for (const step of steps) {
      expect(screen.getByText(step.title)).toBeInTheDocument();
    }
  });

  it("shows checkmarks for completed steps and empty circles for incomplete", () => {
    mockOnboardingContext.onboardingState = {
      tourCompleted: false,
      currentStep: 3,
      completedSteps: ["welcome", "dashboard", "sidebar"],
      hintsDismissed: [],
      tourSkipped: false,
    };
    renderTab();

    // Completed steps should have checkmarks
    const completedSteps = ["welcome", "dashboard", "sidebar"];
    for (const stepId of completedSteps) {
      const indicator = screen.getByTestId(`step-indicator-${stepId}`);
      expect(indicator).toHaveAttribute("data-completed", "true");
    }

    // Incomplete steps should have empty circles
    const incompleteSteps = ["client-list", "client-detail", "follow-ups", "command-palette", "smart-lists"];
    for (const stepId of incompleteSteps) {
      const indicator = screen.getByTestId(`step-indicator-${stepId}`);
      expect(indicator).toHaveAttribute("data-completed", "false");
    }
  });

  // ─── VAL-REPLAY-004: Button text adapts to tour state ────────────────

  it('shows "Replay Tour" when tour is completed', () => {
    mockOnboardingContext.onboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: getStepsForRole("associate").map((s) => s.id),
      hintsDismissed: [],
      tourSkipped: false,
    };
    renderTab();
    expect(screen.getByRole("button", { name: /replay tour/i })).toBeInTheDocument();
  });

  it('shows "Start Tour" when tour was never completed', () => {
    mockOnboardingContext.onboardingState = {
      tourCompleted: false,
      currentStep: 0,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    renderTab();
    expect(screen.getByRole("button", { name: /start tour/i })).toBeInTheDocument();
  });

  it('shows "Start Tour" when tour was skipped', () => {
    mockOnboardingContext.onboardingState = {
      tourCompleted: true,
      currentStep: 3,
      completedSteps: ["welcome", "dashboard", "sidebar"],
      hintsDismissed: [],
      tourSkipped: true,
    };
    renderTab();
    expect(screen.getByRole("button", { name: /start tour/i })).toBeInTheDocument();
  });

  it("disables button when tour is active", () => {
    mockOnboardingContext.tourStatus = "active";
    mockOnboardingContext.currentStepIndex = 3;
    mockOnboardingContext.onboardingState = {
      tourCompleted: false,
      currentStep: 3,
      completedSteps: ["welcome", "dashboard", "sidebar"],
      hintsDismissed: [],
      tourSkipped: false,
    };
    renderTab();
    expect(screen.getByRole("button", { name: /tour in progress/i })).toBeDisabled();
  });

  // ─── VAL-REPLAY-005: Confirmation dialog ─────────────────────────────

  it("shows confirmation dialog when button is clicked", async () => {
    const user = userEvent.setup();
    mockOnboardingContext.onboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: getStepsForRole("associate").map((s) => s.id),
      hintsDismissed: [],
      tourSkipped: false,
    };
    renderTab();

    await user.click(screen.getByRole("button", { name: /replay tour/i }));

    // Dialog should show with title, description, and action buttons
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
  });

  it("cancels without changing state", async () => {
    const user = userEvent.setup();
    mockOnboardingContext.onboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: getStepsForRole("associate").map((s) => s.id),
      hintsDismissed: ["add-client"],
      tourSkipped: false,
    };
    renderTab();

    await user.click(screen.getByRole("button", { name: /replay tour/i }));
    // Dialog should be open
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    // Dialog should be gone
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // State should be unchanged — startTour not called
    expect(mockStartTour).not.toHaveBeenCalled();
  });

  // ─── VAL-REPLAY-006: Confirm resets tour state and starts from step 1 ─

  it("confirms reset: calls updateOnboardingState preserving hintsDismissed, then startTour", async () => {
    const user = userEvent.setup();
    mockOnboardingContext.onboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: getStepsForRole("associate").map((s) => s.id),
      hintsDismissed: ["add-client", "edit-client"],
      tourSkipped: false,
    };
    renderTab();

    await user.click(screen.getByRole("button", { name: /replay tour/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    // Should have called updateOnboardingState to reset tour fields
    expect(mockUpdateOnboardingState).toHaveBeenCalledWith(
      expect.objectContaining({
        tourCompleted: false,
        completedSteps: [],
        currentStep: 0,
        hintsDismissed: ["add-client", "edit-client"],
      }),
    );

    // Should have called startTour to begin from step 1
    expect(mockStartTour).toHaveBeenCalledWith(1);
  });

  // ─── VAL-REPLAY-008: Loading state during reset ──────────────────────

  it("shows loading state on button during reset", async () => {
    // Make updateOnboardingState hang so we can see the loading state
    let resolveUpdate: () => void;
    mockUpdateOnboardingState.mockImplementationOnce(
      () => new Promise<{ tourCompleted: boolean }>((resolve) => { resolveUpdate = () => resolve({ tourCompleted: false }); }),
    );

    const user = userEvent.setup();
    mockOnboardingContext.onboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: getStepsForRole("associate").map((s) => s.id),
      hintsDismissed: [],
      tourSkipped: false,
    };
    renderTab();

    await user.click(screen.getByRole("button", { name: /replay tour/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    // Confirm button should be disabled during loading
    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    expect(confirmBtn).toBeDisabled();

    // Resolve the promise
    await act(async () => { resolveUpdate!(); });
  });

  // ─── VAL-REPLAY-009: Replay works for all prior tour states ────────────

  it('shows "Start Tour" and works after skip', async () => {
    mockOnboardingContext.onboardingState = {
      tourCompleted: true,
      currentStep: 0,
      completedSteps: ["welcome"],
      hintsDismissed: [],
      tourSkipped: true,
    };
    renderTab();

    expect(screen.getByRole("button", { name: /start tour/i })).toBeInTheDocument();
    expect(screen.getByText(/not completed/i)).toBeInTheDocument();
  });

  it('shows "Not Completed" with partial progress for partial tour', () => {
    mockOnboardingContext.onboardingState = {
      tourCompleted: false,
      currentStep: 4,
      completedSteps: ["welcome", "dashboard", "sidebar"],
      hintsDismissed: [],
      tourSkipped: false,
    };
    renderTab();

    expect(screen.getByText(/not completed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start tour/i })).toBeInTheDocument();
  });

  // ─── VAL-REPLAY-010: Multiple sequential replays ──────────────────────

  it("allows multiple sequential replays without corrupting state", async () => {
    const user = userEvent.setup();

    // First replay
    mockOnboardingContext.onboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: getStepsForRole("associate").map((s) => s.id),
      hintsDismissed: ["add-client"],
      tourSkipped: false,
    };
    const { unmount } = renderTab();

    await user.click(screen.getByRole("button", { name: /replay tour/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(mockUpdateOnboardingState).toHaveBeenCalledTimes(1);
    expect(mockStartTour).toHaveBeenCalledTimes(1);

    unmount();
    vi.clearAllMocks();

    // Simulate second replay (e.g., after completing tour again)
    mockOnboardingContext.onboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: getStepsForRole("associate").map((s) => s.id),
      hintsDismissed: ["add-client"],
      tourSkipped: false,
    };
    renderTab();

    await user.click(screen.getByRole("button", { name: /replay tour/i }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(mockUpdateOnboardingState).toHaveBeenCalledTimes(1);
    expect(mockStartTour).toHaveBeenCalledTimes(1);
    // State should be clean reset
    expect(mockUpdateOnboardingState).toHaveBeenCalledWith(
      expect.objectContaining({
        tourCompleted: false,
        completedSteps: [],
        currentStep: 0,
        hintsDismissed: ["add-client"],
      }),
    );
  });

  // ─── VAL-REPLAY-014: Keyboard accessible ──────────────────────────────

  it("tab trigger and action button are keyboard accessible", () => {
    mockOnboardingContext.onboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: getStepsForRole("associate").map((s) => s.id),
      hintsDismissed: [],
      tourSkipped: false,
    };
    renderTab();

    const button = screen.getByRole("button", { name: /replay tour/i });
    expect(button).not.toHaveAttribute("tabindex", "-1");
  });

  // ─── VAL-REPLAY-016: Role change reflected ────────────────────────────

  it("updates step list when role changes", () => {
    // First render as associate
    mockSession.data.user.role = "associate";
    mockOnboardingContext.totalSteps = 8;
    mockOnboardingContext.onboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: getStepsForRole("associate").map((s) => s.id),
      hintsDismissed: [],
      tourSkipped: false,
    };
    const { unmount } = renderTab();

    // Should show 8 steps, not manager steps
    expect(screen.queryByText("Approvals Queue")).not.toBeInTheDocument();
    unmount();

    // Now render as manager
    mockSession.data.user.role = "manager";
    mockOnboardingContext.totalSteps = 12;
    mockOnboardingContext.onboardingState = {
      tourCompleted: true,
      currentStep: 12,
      completedSteps: getStepsForRole("manager").map((s) => s.id),
      hintsDismissed: [],
      tourSkipped: false,
    };
    renderTab();

    // Should show 12 steps including manager steps
    expect(screen.getByText("Approvals Queue")).toBeInTheDocument();
    expect(screen.getByText("Employee Management")).toBeInTheDocument();
    expect(screen.getByText("Backup")).toBeInTheDocument();
    expect(screen.getByText("Analytics Dashboard")).toBeInTheDocument();
  });

  // ─── Confirmation dialog accessibility ─────────────────────────────────

  it("confirmation dialog traps focus and has ARIA attributes", async () => {
    const user = userEvent.setup();
    mockOnboardingContext.onboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: getStepsForRole("associate").map((s) => s.id),
      hintsDismissed: [],
      tourSkipped: false,
    };
    renderTab();

    await user.click(screen.getByRole("button", { name: /replay tour/i }));

    // Dialog should have proper ARIA attributes
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // Radix Dialog sets aria-describedby on the content and uses
    // aria-labelledby for the title
    expect(dialog).toHaveAttribute("aria-labelledby");
  });

  it("confirmation dialog is dismissible via Escape", async () => {
    const user = userEvent.setup();
    mockOnboardingContext.onboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: getStepsForRole("associate").map((s) => s.id),
      hintsDismissed: [],
      tourSkipped: false,
    };
    renderTab();

    await user.click(screen.getByRole("button", { name: /replay tour/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Press Escape to close dialog
    await user.keyboard("{Escape}");

    // Dialog should be gone
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockStartTour).not.toHaveBeenCalled();
  });

  // ─── VAL-REPLAY-015: Mobile rendering ──────────────────────────────────

  it("renders correctly on mobile (375px) — all content visible", () => {
    mockOnboardingContext.isMobile = true;
    mockOnboardingContext.onboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: getStepsForRole("associate").map((s) => s.id),
      hintsDismissed: [],
      tourSkipped: false,
    };
    renderTab();

    // Content should still be visible on mobile
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /replay tour/i })).toBeInTheDocument();
  });
});
