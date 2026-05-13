"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  getOnboardingState,
  updateOnboardingState,
  type OnboardingState,
} from "@/lib/actions/onboarding";
import type { TourStep } from "./tour-steps";
import { getStepsForRole } from "./tour-steps";
import type { HintId } from "./hint-definitions";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type TourStatus = "idle" | "active" | "paused" | "completed";

/** Subset of OnboardingState fields that are safe to send as updates. */
interface OnboardingUpdate {
  tourCompleted?: boolean;
  currentStep?: number;
  completedSteps?: string[];
  hintsDismissed?: HintId[];
  tourSkipped?: boolean;
}

export interface OnboardingContextValue {
  /** Current tour status. */
  tourStatus: TourStatus;
  /** 1-based index of the current step. `0` when tour is not active. */
  currentStepIndex: number;
  /** Total number of steps for the current user's role. */
  totalSteps: number;
  /** Resolved step definitions for the current role. */
  steps: TourStep[];
  /** The current step object, or `null`. */
  currentStep: TourStep | null;
  /** Server-persisted onboarding state. */
  onboardingState: OnboardingState | null;
  /** True while the initial server state is loading. */
  loading: boolean;
  /** Start (or restart) the tour from a given 1-based step index (default 1). */
  startTour: (fromStep?: number) => void;
  /** Advance to the next step. Completes tour if on last step. */
  nextStep: () => void;
  /** Go back to the previous step. No-op on step 1. */
  prevStep: () => void;
  /** Skip the tour entirely — marks as completed + skipped. */
  skipTour: () => void;
  /** Pause the tour (Escape key). Remains resumable. */
  pauseTour: () => void;
  /** Resume a paused tour. */
  resumeTour: () => void;
  /** Complete the tour and mark as done. */
  completeTour: () => void;
  /** Whether the current viewport is below 768px (mobile). */
  isMobile: boolean;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return ctx;
}

/* -------------------------------------------------------------------------- */
/* Mobile detection hook                                                       */
/* -------------------------------------------------------------------------- */

function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);

  return isMobile;
}

/* -------------------------------------------------------------------------- */
/* Provider                                                                    */
/* -------------------------------------------------------------------------- */

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status: sessionStatus } = useSession();
  const isMobile = useIsMobile();

  const role = session?.user?.role ?? "associate";
  const userId = session?.user?.id ?? "";

  const steps = useMemo(() => getStepsForRole(role), [role]);
  const totalSteps = steps.length;

  /* ---- internal state ---- */
  const [tourStatus, setTourStatus] = useState<TourStatus>("idle");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);

  const initialisedRef = useRef(false);
  const persistingRef = useRef(false);

  /* ---- current step object ---- */
  const currentStep = useMemo(
    () => (currentStepIndex >= 1 && currentStepIndex <= steps.length ? steps[currentStepIndex - 1] : null),
    [currentStepIndex, steps],
  );

  /* ---- load persisted state on mount ---- */
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    if (initialisedRef.current) return;
    initialisedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const state = await getOnboardingState();
        if (cancelled) return;
        setOnboardingState(state);

        // Auto-trigger logic:
        //  - state is null → first login, start tour
        //  - state.tourCompleted is false AND currentStep > 0 → resume
        if (!isMobileRef.current) {
          if (state === null) {
            // First login – auto trigger after short delay
            setTimeout(() => {
              if (!cancelled) {
                const idx = Math.max(1, Math.min(1, totalSteps));
                setCurrentStepIndex(idx);
                setTourStatus("active");
              }
            }, 800);
          } else if (!state.tourCompleted && !state.tourSkipped && state.currentStep > 0) {
            // Resume from persisted step — navigate to the step's target page first
            const resumeStep = getStepsForRole(role)[state.currentStep - 1];
            if (resumeStep && resumeStep.page !== "current" && resumeStep.page !== pathname) {
              router.replace(resumeStep.page);
            }
            setCurrentStepIndex(state.currentStep);
            setTourStatus("active");
          }
        }
      } catch (err) {
        // Server action failure — continue without tour
        console.error("[OnboardingProvider] Failed to load onboarding state:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus]);

  /* ---- helpers ---- */

  /* ---- public API ---- */

  const startTour = useCallback(
    (fromStep = 1) => {
      if (isMobile) return;
      const idx = Math.max(1, Math.min(fromStep, totalSteps));
      setCurrentStepIndex(idx);
      setTourStatus("active");
      // Prepare side effects for the starting step
      prepareStepSideEffects(idx);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isMobile, totalSteps],
  );

  /* ---- step side effects (sidebar expand, client nav, etc.) ---- */

  /**
   * Prepare side effects before spotlighting a step:
   * - Step 3 (sidebar): Expand sidebar if collapsed
   * - Step 5 (client-detail): Navigate to a client owned by the current user
   * - Step 7 (command-palette): Prevent palette from opening on spotlight
   */
  const prepareStepSideEffects = useCallback(
    (stepIndex: number) => {
      const stepDef = steps[stepIndex - 1];
      if (!stepDef) return;

      switch (stepDef.id) {
        case "sidebar": {
          // Expand sidebar if collapsed so navigation items are visible
          const sidebarEl = document.querySelector("[data-sidebar]");
          if (sidebarEl) {
            const collapsed = sidebarEl.getAttribute("data-sidebar") === "collapsed"
              || sidebarEl.closest("[data-state='collapsed']");
            if (collapsed) {
              // Use the SidebarProvider's toggle mechanism
              // Dispatch a custom event that the SidebarTrigger listens to,
              // or directly toggle via localStorage + state
              const sidebarToggle = document.querySelector("[data-sidebar-trigger]");
              if (sidebarToggle instanceof HTMLElement) {
                sidebarToggle.click();
              }
            }
          }
          // Alternative: check for data-sidebar="collapsed" on the sidebar container
          try {
            const stored = localStorage.getItem("sidebar:collapsed");
            if (stored === "true") {
              localStorage.setItem("sidebar:collapsed", "false");
              // Force a state update by toggling the sidebar trigger
              const trigger = document.querySelector("[data-slot='sidebar-trigger']") as HTMLElement | null
                || document.querySelector("button[data-sidebar-trigger]") as HTMLElement | null;
              if (trigger) trigger.click();
            }
          } catch {
            // localStorage not available
          }
          break;
        }
        case "client-detail": {
          // Find a client owned by the current user to navigate to
          fetch("/api/clients?limit=1&myClients=true")
            .then((r) => (r.ok ? r.json() : { clients: [] }))
            .then((data) => {
              const clients = data.clients ?? data;
              if (Array.isArray(clients) && clients.length > 0) {
                const clientId = clients[0].id;
                // Update the step's page to include the specific client ID
                const clientStep = steps[stepIndex - 1];
                if (clientStep) {
                  clientStep.page = `/clients/${clientId}`;
                }
                // Navigate if not already on the client page
                if (!pathname.startsWith(`/clients/${clientId}`)) {
                  router.replace(`/clients/${clientId}`);
                }
              } else {
                // No clients found — update step description to informational message
                const clientStep = steps[stepIndex - 1];
                if (clientStep) {
                  clientStep.description = "Client details will appear here once you've added your first client. Use the 'Add Client' button to get started!";
                  clientStep.page = "/clients";
                }
              }
            })
            .catch(() => {
              // On error, just navigate to clients list
              const clientStep = steps[stepIndex - 1];
              if (clientStep) {
                clientStep.page = "/clients";
              }
            });
          break;
        }
        case "command-palette": {
          // Step 7 must NOT trigger the command palette.
          // We add a temporary CSS class that prevents pointer events from
          // reaching the trigger's onClick handler.
          // The TourOverlay already blocks clicks on non-highlighted elements,
          // so the palette won't open. No extra action needed here,
          // but we add a data attribute to signal the spotlight.
          const trigger = document.querySelector("[data-tour='command-palette-trigger']");
          if (trigger) {
            trigger.setAttribute("data-tour-prevent-click", "true");
          }
          break;
        }
        default:
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, pathname, router, userId],
  );

  const persistStep = useCallback(
    async (stepIndex: number, extra?: OnboardingUpdate) => {
      if (persistingRef.current) return;
      persistingRef.current = true;
      try {
        const stepId = steps[stepIndex - 1]?.id;
        const existing = onboardingState;
        const completedSteps = existing?.completedSteps ?? [];
        const newCompleted = stepId && !completedSteps.includes(stepId)
          ? [...completedSteps, stepId]
          : completedSteps;

        const updated = await updateOnboardingState({
          currentStep: stepIndex,
          completedSteps: newCompleted,
          ...extra,
        } as Parameters<typeof updateOnboardingState>[0]);
        setOnboardingState(updated);
      } catch (err) {
        // Silently continue on server failure, but log for development
        console.error("[OnboardingProvider] Failed to persist step:", err);
      } finally {
        persistingRef.current = false;
      }
    },
    [steps, onboardingState],
  );

  const nextStep = useCallback(async () => {
    if (tourStatus !== "active") return;

    // Clean up command-palette prevent-click attribute from previous step
    const prevTrigger = document.querySelector("[data-tour-prevent-click]");
    if (prevTrigger) prevTrigger.removeAttribute("data-tour-prevent-click");

    if (currentStepIndex >= totalSteps) {
      // Already on last step → complete
      setTourStatus("completed");
      setCurrentStepIndex(0);

      try {
        const updated = await updateOnboardingState({
          tourCompleted: true,
          currentStep: totalSteps,
          completedSteps: steps.map((s) => s.id),
        });
        setOnboardingState(updated);
      } catch (err) {
        // continue locally, but log for development
        console.error("[OnboardingProvider] Failed to persist tour completion on last step:", err);
      }
      return;
    }

    const nextIdx = currentStepIndex + 1;
    setCurrentStepIndex(nextIdx);

    // Prepare side effects for the new step (sidebar expansion, client nav, etc.)
    prepareStepSideEffects(nextIdx);

    const nextStepDef = steps[nextIdx - 1];
    if (nextStepDef && nextStepDef.page !== "current" && nextStepDef.page !== pathname) {
      router.replace(nextStepDef.page);
    }

    persistStep(nextIdx);
  }, [tourStatus, currentStepIndex, totalSteps, steps, pathname, router, persistStep, prepareStepSideEffects]);

  const prevStep = useCallback(() => {
    if (tourStatus !== "active") return;
    if (currentStepIndex <= 1) return;

    // Clean up command-palette prevent-click attribute from previous step
    const prevTrigger = document.querySelector("[data-tour-prevent-click]");
    if (prevTrigger) prevTrigger.removeAttribute("data-tour-prevent-click");

    const prevIdx = currentStepIndex - 1;
    setCurrentStepIndex(prevIdx);

    // Prepare side effects for the step we're going back to
    prepareStepSideEffects(prevIdx);

    const prevStepDef = steps[prevIdx - 1];
    if (prevStepDef && prevStepDef.page !== "current" && prevStepDef.page !== pathname) {
      router.replace(prevStepDef.page);
    }

    persistStep(prevIdx);
  }, [tourStatus, currentStepIndex, steps, pathname, router, persistStep, prepareStepSideEffects]);

  const skipTour = useCallback(async () => {
    // Clean up command-palette prevent-click attribute
    const prevTrigger = document.querySelector("[data-tour-prevent-click]");
    if (prevTrigger) prevTrigger.removeAttribute("data-tour-prevent-click");

    setTourStatus("idle");
    setCurrentStepIndex(0);

    try {
      const updated = await updateOnboardingState({
        tourCompleted: true,
        tourSkipped: true,
        currentStep: currentStepIndex || 1,
      });
      setOnboardingState(updated);
    } catch (err) {
      // continue locally, but log for development
      console.error("[OnboardingProvider] Failed to persist skip tour:", err);
    }
  }, [currentStepIndex]);

  const pauseTour = useCallback(() => {
    if (tourStatus !== "active") return;
    setTourStatus("paused");
  }, [tourStatus]);

  const resumeTour = useCallback(() => {
    if (tourStatus !== "paused") return;
    setTourStatus("active");
  }, [tourStatus]);

  const completeTour = useCallback(async () => {
    setTourStatus("completed");
    setCurrentStepIndex(0);

    try {
      const updated = await updateOnboardingState({
        tourCompleted: true,
        currentStep: totalSteps,
        completedSteps: steps.map((s) => s.id),
      });
      setOnboardingState(updated);
    } catch (err) {
      // continue locally, but log for development
      console.error("[OnboardingProvider] Failed to persist tour completion:", err);
    }
  }, [steps, totalSteps]);

  /* ---- keyboard handling ---- */
  useEffect(() => {
    if (tourStatus !== "active") return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        // Check if Command Palette is open — it gets priority over tour pause
        const commandDialog = document.querySelector("[data-command-dialog]");
        const commandRadixOpen = document.querySelector('[role="dialog"][data-state="open"][data-command-root]');
        const commandOverlay = document.querySelector("[cmdk-root]");
        if (commandDialog || commandRadixOpen || commandOverlay) {
          // Let the command palette handle Escape — don't pause tour
          return;
        }
        pauseTour();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [tourStatus, pauseTour]);

  /* ---- context value ---- */
  const value = useMemo<OnboardingContextValue>(
    () => ({
      tourStatus,
      currentStepIndex,
      totalSteps,
      steps,
      currentStep,
      onboardingState,
      loading,
      startTour,
      nextStep,
      prevStep,
      skipTour,
      pauseTour,
      resumeTour,
      completeTour,
      isMobile,
    }),
    [
      tourStatus, currentStepIndex, totalSteps, steps, currentStep,
      onboardingState, loading, startTour, nextStep, prevStep,
      skipTour, pauseTour, resumeTour, completeTour, isMobile,
    ],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}
