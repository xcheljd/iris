import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock next-auth before importing actions
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { getOnboardingState, updateOnboardingState } from "@/lib/actions/onboarding";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Real session shapes matching the auth callbacks
const MANAGER_SESSION: Session = {
  user: { id: "2d7a352d-53a0-4544-b515-902e7dd59206", name: "Marcus", role: "manager" as const, firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

const ASSOCIATE_SESSION: Session = {
  user: { id: "590628cf-d623-456d-bdad-d16ab0ec2b23", name: "Jordan", role: "associate" as const, firstName: "Jordan", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

describe("Onboarding Actions", () => {
  const originalStates = new Map<string, string | null>();

  beforeEach(() => {
    // Store original onboarding states for cleanup
    for (const session of [MANAGER_SESSION, ASSOCIATE_SESSION]) {
      const row = db.select({ onboarding_state: employees.onboardingState })
        .from(employees)
        .where(eq(employees.id, session.user.id))
        .get();
      originalStates.set(session.user.id, row?.onboarding_state ?? null);
    }
  });

  afterEach(() => {
    // Restore original onboarding states
    for (const [id, state] of originalStates) {
      db.update(employees)
        .set({ onboardingState: state })
        .where(eq(employees.id, id))
        .run();
    }
    originalStates.clear();
  });

  // ─── getOnboardingState ─────────────────────────────────────────────

  describe("getOnboardingState", () => {
    it("should return null for user with no onboarding_state", async () => {
      vi.mocked(getServerSession).mockResolvedValue(MANAGER_SESSION);

      // Ensure onboarding_state is null
      db.update(employees)
        .set({ onboardingState: null })
        .where(eq(employees.id, MANAGER_SESSION.user.id))
        .run();

      const result = await getOnboardingState();
      expect(result).toBeNull();
    });

    it("should return parsed JSON for existing onboarding state", async () => {
      vi.mocked(getServerSession).mockResolvedValue(MANAGER_SESSION);

      const state = {
        tourCompleted: true,
        currentStep: 5,
        completedSteps: ["welcome", "dashboard", "sidebar", "client-list", "follow-ups"],
        hintsDismissed: ["add-client"],
        tourSkipped: false,
      };
      db.update(employees)
        .set({ onboardingState: JSON.stringify(state) })
        .where(eq(employees.id, MANAGER_SESSION.user.id))
        .run();

      const result = await getOnboardingState();
      expect(result).toEqual(state);
    });

    it("should require authentication", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      await expect(getOnboardingState()).rejects.toThrow("Not authenticated");
    });
  });

  // ─── updateOnboardingState ──────────────────────────────────────────

  describe("updateOnboardingState", () => {
    it("should require authentication", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      await expect(
        updateOnboardingState({ currentStep: 1 })
      ).rejects.toThrow("Not authenticated");
    });

    it("should persist valid state and read it back", async () => {
      vi.mocked(getServerSession).mockResolvedValue(ASSOCIATE_SESSION);

      // Start from null
      db.update(employees)
        .set({ onboardingState: null })
        .where(eq(employees.id, ASSOCIATE_SESSION.user.id))
        .run();

      const updates = {
        currentStep: 3,
        completedSteps: ["welcome", "dashboard"],
        hintsDismissed: [] as ("add-client" | "edit-client" | "log-outreach" | "command-palette")[],
        tourCompleted: false,
        tourSkipped: false,
      };

      await updateOnboardingState(updates);

      // Read back
      const row = db.select({ onboarding_state: employees.onboardingState })
        .from(employees)
        .where(eq(employees.id, ASSOCIATE_SESSION.user.id))
        .get();

      const parsed = JSON.parse(row!.onboarding_state!);
      expect(parsed.currentStep).toBe(3);
      expect(parsed.completedSteps).toEqual(["welcome", "dashboard"]);
    });

    it("should validate currentStep range for associate (1-8)", async () => {
      vi.mocked(getServerSession).mockResolvedValue(ASSOCIATE_SESSION);

      // currentStep = 0 (below minimum)
      await expect(
        updateOnboardingState({ currentStep: 0 })
      ).rejects.toThrow();

      // currentStep = 9 (above associate max)
      await expect(
        updateOnboardingState({ currentStep: 9 })
      ).rejects.toThrow();

      // currentStep = 8 should be valid
      await expect(
        updateOnboardingState({ currentStep: 8 })
      ).resolves.toBeDefined();
    });

    it("should validate currentStep range for manager (1-12)", async () => {
      vi.mocked(getServerSession).mockResolvedValue(MANAGER_SESSION);

      // currentStep = 13 (above manager max)
      await expect(
        updateOnboardingState({ currentStep: 13 })
      ).rejects.toThrow();

      // currentStep = 12 should be valid
      await expect(
        updateOnboardingState({ currentStep: 12 })
      ).resolves.toBeDefined();
    });

    it("should validate hint IDs against whitelist", async () => {
      vi.mocked(getServerSession).mockResolvedValue(ASSOCIATE_SESSION);

      // Invalid hint ID
      await expect(
        updateOnboardingState({
          currentStep: 1,
          hintsDismissed: ["invalid-hint" as "add-client"],
        })
      ).rejects.toThrow();

      // Valid hint IDs
      await expect(
        updateOnboardingState({
          currentStep: 1,
          hintsDismissed: ["add-client", "edit-client", "log-outreach", "command-palette"],
        })
      ).resolves.toBeDefined();
    });

    it("should prevent duplicate hint IDs in hintsDismissed", async () => {
      vi.mocked(getServerSession).mockResolvedValue(ASSOCIATE_SESSION);

      // Set initial state with add-client hint dismissed
      db.update(employees)
        .set({
          onboardingState: JSON.stringify({
            tourCompleted: true,
            currentStep: 8,
            completedSteps: ["welcome", "dashboard"],
            hintsDismissed: ["add-client"],
            tourSkipped: false,
          }),
        })
        .where(eq(employees.id, ASSOCIATE_SESSION.user.id))
        .run();

      // Try to dismiss add-client again
      const result = await updateOnboardingState({
        currentStep: 8,
        hintsDismissed: ["add-client", "edit-client"],
      });

      // Should not have duplicates
      const parsed = result;
      expect(parsed.hintsDismissed).toContain("add-client");
      expect(parsed.hintsDismissed).toContain("edit-client");
      const addClientCount = parsed.hintsDismissed.filter((h: string) => h === "add-client").length;
      expect(addClientCount).toBe(1);
    });

    it("should be idempotent — repeated calls with same payload produce same state", async () => {
      vi.mocked(getServerSession).mockResolvedValue(ASSOCIATE_SESSION);

      // Start from null
      db.update(employees)
        .set({ onboardingState: null })
        .where(eq(employees.id, ASSOCIATE_SESSION.user.id))
        .run();

      const payload = {
        currentStep: 5,
        completedSteps: ["welcome", "dashboard", "sidebar"],
        hintsDismissed: ["add-client"] as ("add-client" | "edit-client" | "log-outreach" | "command-palette")[],
        tourCompleted: false,
        tourSkipped: false,
      };

      const result1 = await updateOnboardingState(payload);
      const result2 = await updateOnboardingState(payload);

      expect(result1).toEqual(result2);
    });

    it("should only affect the current user's row", async () => {
      vi.mocked(getServerSession).mockResolvedValue(ASSOCIATE_SESSION);

      // Set manager state to something known
      const managerOriginalState = {
        tourCompleted: false,
        currentStep: 3,
        completedSteps: ["welcome"],
        hintsDismissed: [],
        tourSkipped: false,
      };
      db.update(employees)
        .set({ onboardingState: JSON.stringify(managerOriginalState) })
        .where(eq(employees.id, MANAGER_SESSION.user.id))
        .run();

      // Clear associate state
      db.update(employees)
        .set({ onboardingState: null })
        .where(eq(employees.id, ASSOCIATE_SESSION.user.id))
        .run();

      // Update associate's state
      await updateOnboardingState({
        currentStep: 7,
        completedSteps: ["welcome", "dashboard", "sidebar", "client-list", "client-detail", "follow-ups"],
      });

      // Manager's state should be unchanged
      const managerRow = db.select({ onboarding_state: employees.onboardingState })
        .from(employees)
        .where(eq(employees.id, MANAGER_SESSION.user.id))
        .get();
      expect(JSON.parse(managerRow!.onboarding_state!)).toEqual(managerOriginalState);
    });

    it("should reject invalid completedSteps values", async () => {
      vi.mocked(getServerSession).mockResolvedValue(ASSOCIATE_SESSION);

      // Invalid step ID
      await expect(
        updateOnboardingState({
          currentStep: 1,
          completedSteps: ["invalid-step-id"],
        })
      ).rejects.toThrow();
    });

    it("should merge updates with existing state correctly", async () => {
      vi.mocked(getServerSession).mockResolvedValue(MANAGER_SESSION);

      // Set initial state
      db.update(employees)
        .set({
          onboardingState: JSON.stringify({
            tourCompleted: false,
            currentStep: 2,
            completedSteps: ["welcome"],
            hintsDismissed: [],
            tourSkipped: false,
          }),
        })
        .where(eq(employees.id, MANAGER_SESSION.user.id))
        .run();

      const result = await updateOnboardingState({
        currentStep: 3,
        completedSteps: ["welcome", "dashboard"],
        hintsDismissed: ["command-palette"],
      });

      const parsed = result;
      expect(parsed.currentStep).toBe(3);
      expect(parsed.completedSteps).toEqual(["welcome", "dashboard"]);
      expect(parsed.hintsDismissed).toEqual(["command-palette"]);
      expect(parsed.tourCompleted).toBe(false);
      expect(parsed.tourSkipped).toBe(false);
    });

    it("should handle tourSkipped flag", async () => {
      vi.mocked(getServerSession).mockResolvedValue(ASSOCIATE_SESSION);

      const result = await updateOnboardingState({
        currentStep: 3,
        tourSkipped: true,
        tourCompleted: false,
      });

      const parsed = result;
      expect(parsed.tourSkipped).toBe(true);
      expect(parsed.tourCompleted).toBe(false);
    });

    it("should validate tourCompleted is boolean when provided", async () => {
      vi.mocked(getServerSession).mockResolvedValue(ASSOCIATE_SESSION);

      // Invalid tourCompleted type
      await expect(
        updateOnboardingState({
          currentStep: 1,
          tourCompleted: "yes" as unknown as boolean,
        })
      ).rejects.toThrow();
    });
  });
});
