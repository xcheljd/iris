import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor, within } from "@testing-library/react";
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
let mockPathname = "/clients";
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: mockReplace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => mockPathname,
}));

let mockOnboardingState: any = null;
const mockUpdateFn = vi.fn().mockResolvedValue({
  tourCompleted: true,
  currentStep: 8,
  completedSteps: [],
  hintsDismissed: [],
  tourSkipped: false,
});

vi.mock("@/lib/actions/onboarding", () => ({
  getOnboardingState: vi.fn(() => Promise.resolve(mockOnboardingState)),
  updateOnboardingState: (...args: any[]) => mockUpdateFn(...args),
}));

// ─── Import after mocks ───────────────────────────────────────────────────

import { OnboardingProvider, useOnboarding } from "@/components/onboarding/onboarding-provider";
import { HintManager } from "@/components/onboarding/hint-manager";
import { HINT_DEFINITIONS, getHintsForPath, getShortcutText, getValidHintIds } from "@/components/onboarding/hint-definitions";

// ─── Test helpers ─────────────────────────────────────────────────────────

/** Creates a target element for hints to attach to. */
function createTargetElement(hintId: string, text?: string) {
  const el = document.createElement("div");
  el.setAttribute("data-hint", hintId);
  el.textContent = text ?? hintId;
  el.style.position = "fixed";
  el.style.top = "100px";
  el.style.left = "100px";
  el.style.width = "100px";
  el.style.height = "40px";
  // Mock getBoundingClientRect since JSDOM returns zeros
  el.getBoundingClientRect = () => ({
    top: 100,
    left: 100,
    width: 100,
    height: 40,
    right: 200,
    bottom: 140,
    x: 100,
    y: 100,
    toJSON: () => ({}),
  });
  document.body.appendChild(el);
  return el;
}

/** Removes all test target elements. */
function cleanupTargetElements() {
  document.querySelectorAll("[data-hint]").forEach((el) => el.remove());
}

/** Context consumer to expose state for testing. */
function ContextConsumer() {
  const ctx = useOnboarding();
  return (
    <div>
      <span data-testid="ctx-status">{ctx.tourStatus}</span>
      <span data-testid="ctx-loading">{ctx.loading ? "true" : "false"}</span>
      <span data-testid="ctx-is-mobile">{ctx.isMobile ? "true" : "false"}</span>
      <span data-testid="ctx-completed">{ctx.onboardingState?.tourCompleted ? "true" : "false"}</span>
    </div>
  );
}

/** Waits for hints to appear after rendering */
async function waitForHints() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 300));
  });
}

describe("HintManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnboardingState = null;
    mockPathname = "/clients";
    mockUpdateFn.mockResolvedValue({
      tourCompleted: true,
      currentStep: 8,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    });
    Object.defineProperty(window, "innerWidth", { value: 1024, writable: true, configurable: true });
    window.dispatchEvent(new Event("resize"));
    cleanupTargetElements();
  });

  afterEach(() => {
    cleanupTargetElements();
  });

  // ── Basic rendering tests ──

  it("does not render when tour is not completed", async () => {
    mockOnboardingState = {
      tourCompleted: false,
      currentStep: 4,
      completedSteps: ["welcome", "dashboard", "sidebar", "client-list"],
      hintsDismissed: [],
      tourSkipped: false,
    };
    createTargetElement("add-client");

    render(
      <OnboardingProvider>
        <HintManager />
        <ContextConsumer />
      </OnboardingProvider>,
    );

    await waitForHints();

    // No hint backdrop should appear
    const backdrops = document.querySelectorAll('[style*="rgba(0, 0, 0, 0.3)"]');
    expect(backdrops.length).toBe(0);
  });

  it("shows hint after tour completion with matching page and target", async () => {
    mockOnboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    createTargetElement("add-client", "Add Client");

    render(
      <OnboardingProvider>
        <HintManager />
        <ContextConsumer />
      </OnboardingProvider>,
    );

    await waitForHints();

    // Should show the hint title
    expect(screen.getByText("Add a New Client")).toBeTruthy();
  });

  it("does not show hint before tour completion (tourCompleted gating)", async () => {
    mockOnboardingState = {
      tourCompleted: false,
      currentStep: 0,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    createTargetElement("add-client");

    render(
      <OnboardingProvider>
        <HintManager />
      </OnboardingProvider>,
    );

    await waitForHints();

    expect(screen.queryByText("Add a New Client")).toBeNull();
  });

  it("does not render during active tour", async () => {
    mockOnboardingState = null; // null triggers auto-start of tour
    createTargetElement("add-client");

    render(
      <OnboardingProvider>
        <HintManager />
        <ContextConsumer />
      </OnboardingProvider>,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    // Tour is active, hints should not appear
    expect(screen.queryByText("Add a New Client")).toBeNull();
  });

  it("does not render on mobile viewports (< 768px)", async () => {
    mockOnboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    Object.defineProperty(window, "innerWidth", { value: 375, writable: true, configurable: true });
    window.dispatchEvent(new Event("resize"));

    createTargetElement("add-client");

    render(
      <OnboardingProvider>
        <HintManager />
      </OnboardingProvider>,
    );

    await waitForHints();

    expect(screen.queryByText("Add a New Client")).toBeNull();
  });

  // ── Dismissal tests ──

  it("dismisses hint permanently on click", async () => {
    mockOnboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    createTargetElement("add-client", "Add Client");

    render(
      <OnboardingProvider>
        <HintManager />
        <ContextConsumer />
      </OnboardingProvider>,
    );

    await waitForHints();

    // Hint should be visible
    expect(screen.getByText("Add a New Client")).toBeTruthy();

    // Click the backdrop to dismiss
    const backdrop = document.querySelector('[style*="rgba(0, 0, 0, 0.3)"]');
    expect(backdrop).toBeTruthy();

    await act(async () => {
      fireEvent.click(backdrop!);
    });

    // Hint should be dismissed
    expect(screen.queryByText("Add a New Client")).toBeNull();

    // Server action should have been called
    expect(mockUpdateFn).toHaveBeenCalled();
  });

  it("dismisses hint on Escape key press", async () => {
    mockOnboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    const targetEl = createTargetElement("add-client", "Add Client");
    targetEl.tabIndex = 0;
    targetEl.focus = vi.fn();

    render(
      <OnboardingProvider>
        <HintManager />
        <ContextConsumer />
      </OnboardingProvider>,
    );

    await waitForHints();

    expect(screen.getByText("Add a New Client")).toBeTruthy();

    // Press Escape to dismiss
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    // Hint should be dismissed
    expect(screen.queryByText("Add a New Client")).toBeNull();
    // Focus should have moved to target element
    expect(targetEl.focus).toHaveBeenCalled();
  });

  it("does not show already dismissed hints", async () => {
    mockOnboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: [],
      hintsDismissed: ["add-client"],
      tourSkipped: false,
    };
    createTargetElement("add-client");

    render(
      <OnboardingProvider>
        <HintManager />
      </OnboardingProvider>,
    );

    await waitForHints();

    // Hint should NOT appear since it's already in hintsDismissed
    expect(screen.queryByText("Add a New Client")).toBeNull();
  });

  // ── Page scoping tests ──

  it("add-client hint only appears on /clients page", async () => {
    mockOnboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    mockPathname = "/dashboard";
    createTargetElement("add-client");

    render(
      <OnboardingProvider>
        <HintManager />
      </OnboardingProvider>,
    );

    await waitForHints();

    // add-client hint should NOT appear on /dashboard
    expect(screen.queryByText("Add a New Client")).toBeNull();
  });

  it("edit-client and log-outreach hints appear on client detail page", async () => {
    mockOnboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    mockPathname = "/clients/abc-123";
    // edit-client targets the Actions button, log-outreach targets the Outreach tab
    createTargetElement("edit-client", "Actions");
    createTargetElement("log-outreach", "Outreach");

    render(
      <OnboardingProvider>
        <HintManager />
      </OnboardingProvider>,
    );

    await waitForHints();

    // Both hints should appear
    expect(screen.getByText("Edit Client Details")).toBeTruthy();
    expect(screen.getByText("Log an Outreach")).toBeTruthy();
  });

  it("command-palette hint appears on any page", async () => {
    mockOnboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    mockPathname = "/dashboard";
    createTargetElement("command-palette", "Search");

    render(
      <OnboardingProvider>
        <HintManager />
      </OnboardingProvider>,
    );

    await waitForHints();

    // command-palette hint should appear on any page
    expect(screen.getByText("Quick Navigation")).toBeTruthy();
  });

  // ── Multiple hints independence test ──

  it("multiple hints on client detail render and dismiss independently", async () => {
    mockOnboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    mockPathname = "/clients/abc-123";
    // edit-client targets the Actions button, log-outreach targets the Outreach tab
    createTargetElement("edit-client", "Actions");
    createTargetElement("log-outreach", "Outreach");

    render(
      <OnboardingProvider>
        <HintManager />
      </OnboardingProvider>,
    );

    await waitForHints();

    // Both hints visible
    expect(screen.getByText("Edit Client Details")).toBeTruthy();
    expect(screen.getByText("Log an Outreach")).toBeTruthy();

    // Dismiss "edit-client" by clicking its spotlight
    const editSpotlight = document.querySelector("[data-hint-spotlight='edit-client']");
    expect(editSpotlight).toBeTruthy();

    await act(async () => {
      fireEvent.click(editSpotlight!);
    });

    // edit-client should be dismissed, log-outreach should remain
    expect(screen.queryByText("Edit Client Details")).toBeNull();
    expect(screen.getByText("Log an Outreach")).toBeTruthy();
  });

  // ── Target element missing test ──

  it("does not render if target element is missing — no orphaned popover, no error", async () => {
    mockOnboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    mockPathname = "/clients";
    // Don't create any target elements

    render(
      <OnboardingProvider>
        <HintManager />
      </OnboardingProvider>,
    );

    // Wait for the polling timeout to expire
    await act(async () => {
      await new Promise((r) => setTimeout(r, 3500));
    });

    // No hint should appear since target element doesn't exist
    expect(screen.queryByText("Add a New Client")).toBeNull();
  });

  // ── Optimistic dismissal test ──

  it("visually dismisses hint even if server action fails", async () => {
    mockUpdateFn.mockRejectedValueOnce(new Error("Network error"));

    mockOnboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    createTargetElement("add-client", "Add Client");

    render(
      <OnboardingProvider>
        <HintManager />
      </OnboardingProvider>,
    );

    await waitForHints();

    expect(screen.getByText("Add a New Client")).toBeTruthy();

    // Dismiss by clicking backdrop
    const backdrop = document.querySelector('[style*="rgba(0, 0, 0, 0.3)"]');
    await act(async () => {
      fireEvent.click(backdrop!);
    });

    // Hint should be visually dismissed despite server failure
    expect(screen.queryByText("Add a New Client")).toBeNull();
  });

  // ── Dismissal is global per type test ──

  it("hint dismissal is global per type (not per client instance)", async () => {
    mockOnboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: [],
      hintsDismissed: ["edit-client"],
      tourSkipped: false,
    };
    // Simulate viewing a different client (client B) after dismissing on client A
    mockPathname = "/clients/client-b-id";
    // edit-client targets Actions button, log-outreach targets Outreach tab
    createTargetElement("edit-client", "Actions");
    createTargetElement("log-outreach", "Outreach");

    render(
      <OnboardingProvider>
        <HintManager />
      </OnboardingProvider>,
    );

    await waitForHints();

    // edit-client should NOT appear (globally dismissed)
    expect(screen.queryByText("Edit Client Details")).toBeNull();
    // log-outreach should still appear (not dismissed)
    expect(screen.getByText("Log an Outreach")).toBeTruthy();
  });

  // ── "Got it" button dismissal test ──

  it("clicking 'Got it' button dismisses the hint", async () => {
    mockOnboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    createTargetElement("add-client", "Add Client");

    render(
      <OnboardingProvider>
        <HintManager />
      </OnboardingProvider>,
    );

    await waitForHints();

    expect(screen.getByText("Add a New Client")).toBeTruthy();

    // Click "Got it" button
    const gotItButton = screen.getByText("Got it");
    await act(async () => {
      fireEvent.click(gotItButton);
    });

    expect(screen.queryByText("Add a New Client")).toBeNull();
    expect(mockUpdateFn).toHaveBeenCalled();
  });

  // ── Platform-specific shortcut test ──

  it("shows platform-specific shortcut text in command-palette hint", async () => {
    mockOnboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    mockPathname = "/clients";
    createTargetElement("command-palette", "Search");
    // Also create add-client so we're on the right page
    createTargetElement("add-client", "Add Client");

    render(
      <OnboardingProvider>
        <HintManager />
      </OnboardingProvider>,
    );

    await waitForHints();

    expect(screen.getByText("Quick Navigation")).toBeTruthy();
    // The description should contain the shortcut text (⌘K or Ctrl+K)
    const descriptions = screen.getAllByText(/Press.*K to open/i);
    expect(descriptions.length).toBeGreaterThanOrEqual(1);
  });

  // ── Accessibility tests ──

  it("has correct ARIA attributes on hint popover", async () => {
    mockOnboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    createTargetElement("add-client", "Add Client");

    render(
      <OnboardingProvider>
        <HintManager />
      </OnboardingProvider>,
    );

    await waitForHints();

    // Check popover has role="tooltip" and aria-describedby
    const tooltipEl = document.querySelector('[role="tooltip"]');
    expect(tooltipEl).toBeTruthy();
    const describedby = tooltipEl?.getAttribute("aria-describedby");
    expect(describedby).toBeTruthy();

    // Check backdrop has aria-hidden
    const backdrop = document.querySelector('[style*="rgba(0, 0, 0, 0.3)"]');
    expect(backdrop?.getAttribute("aria-hidden")).toBe("true");
  });

  it("has aria-live region for screen reader announcements", async () => {
    mockOnboardingState = {
      tourCompleted: true,
      currentStep: 8,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: false,
    };
    createTargetElement("add-client", "Add Client");

    render(
      <OnboardingProvider>
        <HintManager />
      </OnboardingProvider>,
    );

    await waitForHints();

    // Check aria-live region exists
    const liveRegion = document.querySelector("[aria-live='polite']");
    expect(liveRegion).toBeTruthy();
    expect(liveRegion?.textContent).toContain("Hint:");
    expect(liveRegion?.textContent).toContain("Add a New Client");
  });
});

// ── Hint definitions unit tests ──

describe("hint-definitions", () => {
  it("defines exactly 4 hints", () => {
    expect(HINT_DEFINITIONS.length).toBe(4);
  });

  it("all hint IDs are valid", () => {
    const ids = getValidHintIds();
    expect(ids).toContain("add-client");
    expect(ids).toContain("edit-client");
    expect(ids).toContain("log-outreach");
    expect(ids).toContain("command-palette");
  });

  it("getHintsForPath returns correct hints for /clients", () => {
    const hints = getHintsForPath("/clients");
    const ids = hints.map((h) => h.id);
    expect(ids).toContain("add-client");
    expect(ids).not.toContain("edit-client");
    expect(ids).not.toContain("log-outreach");
    // command-palette can appear on any page
    expect(ids).toContain("command-palette");
  });

  it("getHintsForPath returns edit-client and log-outreach for /clients/[id]", () => {
    const hints = getHintsForPath("/clients/abc-123");
    const ids = hints.map((h) => h.id);
    expect(ids).toContain("edit-client");
    expect(ids).toContain("log-outreach");
    expect(ids).not.toContain("add-client");
  });

  it("getHintsForPath returns command-palette for any path", () => {
    const hints = getHintsForPath("/dashboard");
    const ids = hints.map((h) => h.id);
    expect(ids).toContain("command-palette");
    expect(ids).not.toContain("add-client");
    expect(ids).not.toContain("edit-client");
  });

  it("getHintsForPath does not return add-client for client detail page", () => {
    const hints = getHintsForPath("/clients/abc-123");
    const ids = hints.map((h) => h.id);
    expect(ids).not.toContain("add-client");
  });

  it("getShortcutText returns a string containing K", () => {
    const text = getShortcutText();
    expect(text).toContain("K");
  });

  it("each hint has required fields", () => {
    for (const hint of HINT_DEFINITIONS) {
      expect(hint.id).toBeTruthy();
      expect(hint.title).toBeTruthy();
      expect(hint.description).toBeTruthy();
      expect(hint.targetSelector).toBeTruthy();
      expect(hint.pageScope).toBeTruthy();
    }
  });

  it("hint target selectors use data-hint attributes", () => {
    for (const hint of HINT_DEFINITIONS) {
      expect(hint.targetSelector).toMatch(/^\[data-hint='[^']+'\]$/);
    }
  });

  it("log-outreach and edit-client target different DOM elements", () => {
    const editClient = HINT_DEFINITIONS.find((h) => h.id === "edit-client")!;
    const logOutreach = HINT_DEFINITIONS.find((h) => h.id === "log-outreach")!;
    // edit-client targets the Actions button, log-outreach targets the Outreach tab
    expect(editClient.targetSelector).toBe("[data-hint='edit-client']");
    expect(logOutreach.targetSelector).toBe("[data-hint='log-outreach']");
    expect(logOutreach.targetSelector).not.toBe(editClient.targetSelector);
  });

  it("no hint definition has an allowMultiple field", () => {
    for (const hint of HINT_DEFINITIONS) {
      expect((hint as any).allowMultiple).toBeUndefined();
    }
  });
});
