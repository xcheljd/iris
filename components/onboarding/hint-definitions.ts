/**
 * Hint definitions for the Iris contextual hints system.
 *
 * Hints appear after tour completion (tourCompleted === true) and are dismissed
 * permanently by the user. Each hint is page-scoped and uses the same visual
 * style as the tour (spotlight + positioned popover).
 */

export interface HintDefinition {
  /** Unique hint ID — must match server action's VALID_HINT_IDS. */
  id: "add-client" | "edit-client" | "log-outreach" | "command-palette";
  /** Title shown in the hint popover. */
  title: string;
  /** Description shown in the hint popover. */
  description: string;
  /** CSS selector for the spotlight target element. */
  targetSelector: string;
  /**
   * Page scope — determines which pages show this hint.
   * Use "any" for hints that appear on all authenticated pages.
   * Use an exact path prefix like "/clients" for page-scoped hints.
   */
  pageScope: string;
  /**
   * If true, this hint can coexist with other hints on the same page.
   * Each hint renders and dismisses independently.
   */
  allowMultiple?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Hint definitions                                                            */
/* -------------------------------------------------------------------------- */

export const HINT_DEFINITIONS: HintDefinition[] = [
  {
    id: "add-client",
    title: "Add a New Client",
    description:
      "Click this button to add a new client to your roster. You can also use ⌘K to search.",
    targetSelector: "[data-hint='add-client']",
    pageScope: "/clients",
  },
  {
    id: "edit-client",
    title: "Edit Client Details",
    description:
      "Click here to edit this client's information, update contact details, or change their status.",
    targetSelector: "[data-hint='edit-client']",
    pageScope: "/clients/",
    allowMultiple: true,
  },
  {
    id: "log-outreach",
    title: "Log an Outreach",
    description:
      "Record calls, texts, emails, and other interactions with this client to keep your history up to date. Click the Actions button to find the Log Outreach option.",
    targetSelector: "[data-hint='edit-client']",
    pageScope: "/clients/",
    allowMultiple: true,
  },
  {
    id: "command-palette",
    title: "Quick Navigation",
    description:
      "Press {shortcut} to open the command palette for instant navigation and search across the app.",
    targetSelector: "[data-hint='command-palette']",
    pageScope: "any",
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Get platform-specific shortcut text (⌘K on Mac, Ctrl+K elsewhere). */
export function getShortcutText(): string {
  if (typeof navigator === "undefined") return "Ctrl+K";
  return /Mac|iPod|iPhone|iPad/.test(navigator.userAgent) ? "⌘K" : "Ctrl+K";
}

/**
 * Get hints that should be active for a given pathname.
 * A hint is active if its pageScope matches the current pathname.
 */
export function getHintsForPath(pathname: string): HintDefinition[] {
  return HINT_DEFINITIONS.filter((hint) => {
    if (hint.pageScope === "any") return true;
    // For "/clients/" scope (edit-client, log-outreach), match /clients/xxx only (not /clients)
    if (hint.pageScope === "/clients/") {
      // Must be a client detail path: starts with /clients/ and has something after
      return pathname.startsWith("/clients/") && pathname !== "/clients/";
    }
    // For "/clients" scope (add-client), match ONLY exact /clients (not /clients/xxx)
    if (hint.pageScope === "/clients") {
      return pathname === "/clients";
    }
    // Generic: exact match or prefix with slash boundary
    return pathname === hint.pageScope || pathname.startsWith(hint.pageScope + "/");
  });
}

/** All valid hint IDs. */
export function getValidHintIds(): string[] {
  return HINT_DEFINITIONS.map((h) => h.id);
}
