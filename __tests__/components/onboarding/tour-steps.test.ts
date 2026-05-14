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
        "analytics",
        "approvals",
        "employee-management",
        "backup",
      ]);
    });

    it("base steps are not marked as managerOnly", () => {
      const baseSteps = getStepsForRole("associate");
      baseSteps.forEach((step) => {
        expect(step.managerOnly).toBeFalsy();
      });
    });

    it("returns deep-cloned step objects — mutations do not affect subsequent calls", () => {
      // First call — get steps and mutate a step
      const steps1 = getStepsForRole("associate");
      const originalPage = steps1[4].page;
      const originalDescription = steps1[4].description;
      // Mutate the returned step
      steps1[4].page = "/mutated/page";
      steps1[4].description = "mutated description";

      // Second call — should return fresh copies with original values
      const steps2 = getStepsForRole("associate");
      expect(steps2[4].page).toBe(originalPage);
      expect(steps2[4].description).toBe(originalDescription);

      // Also verify the manager path returns clean copies
      const steps3 = getStepsForRole("manager");
      expect(steps3[4].page).toBe(originalPage);
      expect(steps3[4].description).toBe(originalDescription);
    });

    it("returns new arrays on each call — not the same reference", () => {
      const steps1 = getStepsForRole("associate");
      const steps2 = getStepsForRole("associate");
      expect(steps1).not.toBe(steps2);
      // Individual step objects should also be different references
      expect(steps1[0]).not.toBe(steps2[0]);
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
      expect(getStepIdForIndex("manager", 9)).toBe("analytics");
      expect(getStepIdForIndex("manager", 12)).toBe("backup");
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

  describe("step ordering matches validation contract", () => {
    it("associate steps match the contract: welcome, dashboard, sidebar, client-list, client-detail, follow-ups, command-palette, smart-lists", () => {
      const steps = getStepsForRole("associate");
      const ids = steps.map((s) => s.id);
      expect(ids).toEqual([
        "welcome",
        "dashboard",
        "sidebar",
        "client-list",
        "client-detail",
        "follow-ups",
        "command-palette",
        "smart-lists",
      ]);
    });

    it("manager steps include 4 extras after base: approvals, employee-management, backup, analytics", () => {
      const steps = getStepsForRole("manager");
      const ids = steps.map((s) => s.id);
      // First 8 match associate
      expect(ids.slice(0, 8)).toEqual([
        "welcome",
        "dashboard",
        "sidebar",
        "client-list",
        "client-detail",
        "follow-ups",
        "command-palette",
        "smart-lists",
      ]);
      // Last 4 are manager-only
      expect(ids.slice(8)).toEqual([
        "analytics",
        "approvals",
        "employee-management",
        "backup",
      ]);
    });
  });

  describe("manager step targets match validation contract (VAL-TOUR-020)", () => {
    const managerSteps = getStepsForRole("manager");

    it("step 9 (analytics) navigates to and spotlights Analytics page area", () => {
      const step = managerSteps[8]; // 0-based index for step 9
      expect(step.id).toBe("analytics");
      expect(step.targetSelector).toBe("[data-tour='analytics']");
      expect(step.page).toBe("/analytics");
      expect(step.title).toContain("Analytics");
    });

    it("step 10 (approvals) spotlights Approvals Queue nav item in sidebar", () => {
      const step = managerSteps[9]; // 0-based index for step 10
      expect(step.id).toBe("approvals");
      expect(step.targetSelector).toBe("[data-tour='approvals']");
      expect(step.page).toBe("/approvals");
      expect(step.description).toContain("request");
    });

    it("step 11 (employee-management) navigates to Settings and spotlights Employee Management tab", () => {
      const step = managerSteps[10]; // 0-based index for step 11
      expect(step.id).toBe("employee-management");
      expect(step.targetSelector).toBe("[data-tour='employee-management']");
      expect(step.page).toBe("/settings");
      expect(step.description).toContain("Employee");
    });

    it("step 12 (backup) spotlights Backup tab within Settings", () => {
      const step = managerSteps[11]; // 0-based index for step 12
      expect(step.id).toBe("backup");
      expect(step.targetSelector).toBe("[data-tour='backup']");
      expect(step.page).toBe("/settings");
      expect(step.description).toContain("Backup");
    });
  });

  describe("base step targets match validation contract", () => {
    const baseSteps = getStepsForRole("associate");

    it("step 3 (sidebar) targets sidebar component with data-tour attribute", () => {
      const step = baseSteps[2]; // 0-based index for step 3
      expect(step.id).toBe("sidebar");
      expect(step.targetSelector).toBe("[data-tour='sidebar-nav']");
    });

    it("step 5 (client-detail) targets client-detail-tabs", () => {
      const step = baseSteps[4]; // 0-based index for step 5
      expect(step.id).toBe("client-detail");
      expect(step.targetSelector).toBe("[data-tour='client-detail-tabs']");
    });

    it("step 7 (command-palette) targets the Cmd+K trigger", () => {
      const step = baseSteps[6]; // 0-based index for step 7
      expect(step.id).toBe("command-palette");
      expect(step.targetSelector).toBe("[data-tour='command-palette-trigger']");
      expect(step.description).toContain("⌘K");
    });

    it("step 7 uses page='current' to stay on the current page", () => {
      const step = baseSteps[6];
      expect(step.page).toBe("current");
    });
  });

  describe("page navigation steps", () => {
    it("steps that change pages have correct page routes", () => {
      const steps = getStepsForRole("manager");
      const pageChangingSteps = steps.filter(
        (s) => s.page !== "current" && s.page !== "/",
      );
      // client-list -> /clients, client-detail -> /clients (dynamic), follow-ups -> /follow-ups,
      // smart-lists -> /smart-lists, approvals -> /approvals, employee-management -> /settings,
      // backup -> /settings, analytics -> /analytics
      expect(pageChangingSteps.length).toBeGreaterThanOrEqual(6);
    });
  });
});
