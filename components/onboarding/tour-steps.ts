/**
 * Tour step definitions for the Iris onboarding system.
 *
 * Base steps (1–8) are shown to both associates and managers.
 * Manager-only steps (9–12) are appended for the manager role.
 */

export interface TourStep {
  id: string;
  title: string;
  description: string;
  /** CSS selector for the spotlight target. `null` for the welcome step (centered dialog). */
  targetSelector: string | null;
  /** Route path the step lives on. Use `"current"` to stay on the same page. */
  page: string;
  /** If `true`, this step is only shown to managers. */
  managerOnly?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Base steps – shared by both roles                                           */
/* -------------------------------------------------------------------------- */

const BASE_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Iris!",
    description:
      "Let us show you around the key features. This quick tour covers the essentials so you can hit the ground running.",
    targetSelector: null,
    page: "/",
  },
  {
    id: "dashboard",
    title: "Dashboard",
    description:
      "Your home base — see total clients, hot leads, recent outreach, and purchases at a glance.",
    targetSelector: "[data-tour='dashboard-stats']",
    page: "/",
  },
  {
    id: "sidebar",
    title: "Sidebar Navigation",
    description:
      "Use the sidebar to jump between every major section of the app: clients, follow-ups, smart lists, and more.",
    targetSelector: "[data-tour='sidebar']",
    page: "/",
  },
  {
    id: "client-list",
    title: "Client List",
    description:
      "Your client roster lives here. Search by name, email, or phone and filter by status, owner, or heat level.",
    targetSelector: "[data-tour='client-list']",
    page: "/clients",
  },
  {
    id: "client-detail",
    title: "Client Detail",
    description:
      "Click any client to see their full profile — contact info, outreach history, tags, and activity timeline.",
    targetSelector: "[data-tour='client-detail-tabs']",
    page: "/clients",
  },
  {
    id: "follow-ups",
    title: "Follow-Ups",
    description:
      "Track overdue and upcoming follow-ups so no client falls through the cracks.",
    targetSelector: "[data-tour='follow-ups']",
    page: "/follow-ups",
  },
  {
    id: "command-palette",
    title: "Command Palette",
    description:
      "Press ⌘K (or Ctrl+K) to quickly search and navigate anywhere in the app.",
    targetSelector: "[data-tour='command-palette-trigger']",
    page: "current",
  },
  {
    id: "smart-lists",
    title: "Smart Lists",
    description:
      "Dynamic client segments that auto-update based on filters — hot leads, cold leads, and more.",
    targetSelector: "[data-tour='smart-lists']",
    page: "/smart-lists",
  },
];

/* -------------------------------------------------------------------------- */
/* Manager-only extra steps                                                    */
/* -------------------------------------------------------------------------- */

const MANAGER_STEPS: TourStep[] = [
  {
    id: "approvals",
    title: "Approvals Queue",
    description:
      "Review and act on ban, unsubscribe, and delete requests submitted by associates.",
    targetSelector: "[data-tour='approvals']",
    page: "/approvals",
    managerOnly: true,
  },
  {
    id: "employee-management",
    title: "Employee Management",
    description:
      "Add, edit, or deactivate team member accounts from the Settings > Employees tab.",
    targetSelector: "[data-tour='employee-management']",
    page: "/settings",
    managerOnly: true,
  },
  {
    id: "backup",
    title: "Backup",
    description:
      "Create and restore database backups from the Settings > Backup tab.",
    targetSelector: "[data-tour='backup']",
    page: "/settings",
    managerOnly: true,
  },
  {
    id: "analytics",
    title: "Analytics Dashboard",
    description:
      "See sales trends, outreach performance, and team metrics to make data-driven decisions.",
    targetSelector: "[data-tour='analytics']",
    page: "/analytics",
    managerOnly: true,
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

export function getStepsForRole(role: string): TourStep[] {
  const sources = role === "manager"
    ? [...BASE_STEPS, ...MANAGER_STEPS]
    : [...BASE_STEPS];
  // Deep-clone each step to prevent callers from mutating the module-level
  // BASE_STEPS / MANAGER_STEPS constants (e.g. prepareStepSideEffects).
  return sources.map((step) => ({ ...step }));
}

export function getTotalSteps(role: string): number {
  return role === "manager" ? 12 : 8;
}

/** Step ID for a given 1-based step index within the role's step list. */
export function getStepIdForIndex(role: string, index: number): string | undefined {
  const steps = getStepsForRole(role);
  // index is 1-based
  return steps[index - 1]?.id;
}

/** All valid step IDs for a role. */
export function getValidStepIds(role: string): string[] {
  return getStepsForRole(role).map((s) => s.id);
}
