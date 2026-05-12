import { describe, it, expect } from "vitest";
import { getStepsForRole, getTotalSteps, getStepIdForIndex, getValidStepIds } from "@/components/onboarding/tour-steps";

describe("tour-steps", () => {
  describe("getStepsForRole", () => {
    it("returns 8 steps for associate role", () => {
      const steps = getStepsForRole("associate");
      expect(steps).toHaveLength(8);
    });

    it("returns 12 steps for manager role", () => {
      const steps = getStepsForRole("manager");
      expect(steps).toHaveLength(12);
    });

    it("returns 8 steps for unknown role (defaults to associate)", () => {
      const steps = getStepsForRole("unknown");
      expect(steps).toHaveLength(8);
    });

    it("all base steps have unique IDs", () => {
      const steps = getStepsForRole("associate");
      const ids = steps.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("all manager steps have unique IDs", () => {
      const steps = getStepsForRole("manager");
      const ids = steps.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("manager steps include all base steps", () => {
      const baseSteps = getStepsForRole("associate");
      const managerSteps = getStepsForRole("manager");
      const baseIds = baseSteps.map((s) => s.id);
      const managerIds = managerSteps.map((s) => s.id);
      baseIds.forEach((id) => {
        expect(managerIds).toContain(id);
      });
    });

    it("first step is welcome with no target selector", () => {
      const steps = getStepsForRole("associate");
      expect(steps[0].id).toBe("welcome");
      expect(steps[0].targetSelector).toBeNull();
    });

    it("each step has required fields", () => {
      const steps = getStepsForRole("manager");
      steps.forEach((step) => {
        expect(step.id).toBeTruthy();
        expect(step.title).toBeTruthy();
        expect(step.description).toBeTruthy();
        expect(step.page).toBeTruthy();
      });
    });

    it("target selectors use data-tour attributes", () => {
      const steps = getStepsForRole("manager");
      steps.forEach((step) => {
        if (step.targetSelector) {
          expect(step.targetSelector).toMatch(/^\[data-tour=['"]/);
        }
      });
    });

    it("manager-only steps are marked as such", () => {
      const managerSteps = getStepsForRole("manager");
      const managerOnlySteps = managerSteps.filter((s) => s.managerOnly);
      expect(managerOnlySteps).toHaveLength(4);
      expect(managerOnlySteps.map((s) => s.id)).toEqual([
        "approvals",
        "employee-management",
        "backup",
        "analytics",
      ]);
    });

    it("base steps are not marked as managerOnly", () => {
      const baseSteps = getStepsForRole("associate");
      baseSteps.forEach((step) => {
        expect(step.managerOnly).toBeFalsy();
      });
    });
  });

  describe("getTotalSteps", () => {
    it("returns 8 for associate", () => {
      expect(getTotalSteps("associate")).toBe(8);
    });

    it("returns 12 for manager", () => {
      expect(getTotalSteps("manager")).toBe(12);
    });
  });

  describe("getStepIdForIndex", () => {
    it("returns step ID for valid 1-based index", () => {
      expect(getStepIdForIndex("associate", 1)).toBe("welcome");
      expect(getStepIdForIndex("associate", 2)).toBe("dashboard");
      expect(getStepIdForIndex("manager", 12)).toBe("analytics");
    });

    it("returns undefined for out-of-range index", () => {
      expect(getStepIdForIndex("associate", 0)).toBeUndefined();
      expect(getStepIdForIndex("associate", 9)).toBeUndefined();
      expect(getStepIdForIndex("manager", 13)).toBeUndefined();
    });
  });

  describe("getValidStepIds", () => {
    it("returns 8 IDs for associate", () => {
      const ids = getValidStepIds("associate");
      expect(ids).toHaveLength(8);
      expect(ids).toContain("welcome");
      expect(ids).toContain("smart-lists");
    });

    it("returns 12 IDs for manager including approvals and analytics", () => {
      const ids = getValidStepIds("manager");
      expect(ids).toHaveLength(12);
      expect(ids).toContain("approvals");
      expect(ids).toContain("analytics");
    });
  });
});
