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
import { useSidebar } from "@/components/ui/sidebar";
import {
  getOnboardingState,
  updateOnboardingState,
  ensureTourDemoClient,
  type OnboardingState,
} from "@/lib/actions/onboarding";
import type { TourStep } from "./tour-steps";
import { getStepsForRole } from "./tour-steps";
import type { HintId } from "./hint-definitions";

/** Per-step page/description overrides applied at render time (no mutation of step defs). */
type StepOverride = { page?: string; description?: string };
type StepOverrides = Record<string, StepOverride>;

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
  /** Replace the cached onboarding state (e.g. after an external reset). */
  refreshOnboardingState: (state: OnboardingState) => void;
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
  const { setOpen: setSidebarOpen } = useSidebar();

  const role = session?.user?.role ?? "associate";

  const rawSteps = useMemo(() => getStepsForRole(role), [role]);
  const totalSteps = rawSteps.length;

  /* ---- internal state ---- */
  const [tourStatus, setTourStatus] = useState<TourStatus>("idle");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  /** Per-step overrides — populated by side-effect runners (e.g. resolved client id). */
  const [stepOverrides, setStepOverrides] = useState<StepOverrides>({});

  const initialisedRef = useRef(false);
  /** True while a persist call is in-flight. Used with pendingPersistRef to coalesce. */
  const persistingRef = useRef(false);
  /** Latest pending persist args; flushed when the in-flight call returns. */
  const pendingPersistRef = useRef<{ stepIndex: number; extra?: OnboardingUpdate } | null>(null);
  /** AbortController for the in-flight client-detail fetch, so step changes can cancel it. */
  const sideEffectAbortRef = useRef<AbortController | null>(null);

  /* ---- merge raw steps with overrides ---- */
  const steps = useMemo<TourStep[]>(
    () => rawSteps.map((s) => {
      const o = stepOverrides[s.id];
      return o ? { ...s, ...o } : s;
    }),
    [rawSteps, stepOverrides],
  );

  /* ---- current step object ---- */
  const currentStep = useMemo(
    () => (currentStepIndex >= 1 && currentStepIndex <= steps.length ? steps[currentStepIndex - 1] : null),
    [currentStepIndex, steps],
  );

  /* ---- mirror isMobile into a ref for the load effect ---- */
  const isMobileRef = useRef(isMobile);
  useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);

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
            const resumeStep = rawSteps[state.currentStep - 1];
            if (resumeStep && resumeStep.page !== "current" && resumeStep.page !== pathname) {
              router.replace(resumeStep.page);
            }
            setCurrentStepIndex(state.currentStep);
            setTourStatus("active");
          } else if (state.tourCompleted || state.tourSkipped) {
            // Tour already completed or skipped — ensure tourStatus stays idle
            setTourStatus("idle");
            setCurrentStepIndex(0);
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

  /* ---- step side effects (sidebar expand, client nav, etc.) ---- */

  /**
   * Prepare side effects before spotlighting a step:
   * - sidebar: open the sidebar via context (works for mobile/desktop)
   * - client-detail: resolve a client id and override the step's page (no mutation)
   * - command-palette: tag the trigger so the spotlight click doesn't open the palette
   *
   * Returns a Promise that resolves once async side effects (e.g. client fetch)
   * have completed and overrides are applied.
   */
  const prepareStepSideEffects = useCallback(
    (stepIndex: number): Promise<void> => {
      const stepDef = rawSteps[stepIndex - 1];
      if (!stepDef) return Promise.resolve();

      // Cancel any pending client-detail fetch from a previous step transition
      sideEffectAbortRef.current?.abort();
      sideEffectAbortRef.current = null;

      switch (stepDef.id) {
        case "sidebar": {
          setSidebarOpen(true);
          return Promise.resolve();
        }
        case "client-detail": {
          return ensureTourDemoClient()
            .then((clientId) => {
              setStepOverrides((prev) => ({
                ...prev,
                "client-detail": { page: `/clients/${clientId}` },
              }));
            })
            .catch(() => {
              setStepOverrides((prev) => ({
                ...prev,
                "client-detail": { page: "/clients" },
              }));
            });
        }
        case "command-palette": {
          const trigger = document.querySelector("[data-tour='command-palette-trigger']");
          if (trigger) trigger.setAttribute("data-tour-prevent-click", "true");
          return Promise.resolve();
        }
        default:
          return Promise.resolve();
      }
    },
    [rawSteps, setSidebarOpen],
  );

  /* ---- public API ---- */

  const startTour = useCallback(
    (fromStep = 1) => {
      if (isMobile) return;
      const idx = Math.max(1, Math.min(fromStep, totalSteps));
      setCurrentStepIndex(idx);
      setTourStatus("active");
      prepareStepSideEffects(idx);
    },
    [isMobile, totalSteps, prepareStepSideEffects],
  );

  const persistStep = useCallback(
    async (stepIndex: number, extra?: OnboardingUpdate) => {
      // If a persist is in-flight, queue the latest args; flushed when the current one resolves
      if (persistingRef.current) {
        pendingPersistRef.current = { stepIndex, extra };
        return;
      }
      persistingRef.current = true;
      try {
        const stepId = rawSteps[stepIndex - 1]?.id;
        const completedSteps = onboardingState?.completedSteps ?? [];
        const newCompleted = stepId && !completedSteps.includes(stepId)
          ? [...completedSteps, stepId]
          : completedSteps;

        const updated = await updateOnboardingState({
          currentStep: stepIndex,
          completedSteps: newCompleted,
          ...extra,
        });
        setOnboardingState(updated);
      } catch (err) {
        console.error("[OnboardingProvider] Failed to persist step:", err);
      } finally {
        persistingRef.current = false;
        const pending = pendingPersistRef.current;
        if (pending) {
          pendingPersistRef.current = null;
          // Fire and forget — recursive call respects the same queue invariants
          persistStep(pending.stepIndex, pending.extra);
        }
      }
    },
    [rawSteps, onboardingState],
  );

  /** Shared cleanup before any step transition or tour exit. */
  const clearStepResidue = useCallback(() => {
    const prevTrigger = document.querySelector("[data-tour-prevent-click]");
    if (prevTrigger) prevTrigger.removeAttribute("data-tour-prevent-click");
    sideEffectAbortRef.current?.abort();
    sideEffectAbortRef.current = null;
  }, []);

  const nextStep = useCallback(async () => {
    if (tourStatus !== "active") return;
    clearStepResidue();

    if (currentStepIndex >= totalSteps) {
      setTourStatus("completed");
      setCurrentStepIndex(0);
      // Optimistically update local state
      setOnboardingState((prev) => prev ? {
        ...prev,
        tourCompleted: true,
        completedSteps: rawSteps.map((s) => s.id),
      } : {
        tourCompleted: true,
        currentStep: totalSteps,
        completedSteps: rawSteps.map((s) => s.id),
        hintsDismissed: [],
        tourSkipped: false,
      });
      try {
        const updated = await updateOnboardingState({
          tourCompleted: true,
          currentStep: totalSteps,
          completedSteps: rawSteps.map((s) => s.id),
        });
        setOnboardingState(updated);
      } catch (err) {
        console.error("[OnboardingProvider] Failed to persist tour completion on last step:", err);
      }
      return;
    }

    const nextIdx = currentStepIndex + 1;
    setCurrentStepIndex(nextIdx);
    await prepareStepSideEffects(nextIdx);

    // Read the next step's page after overrides have been applied
    const nextPage = stepOverrides[rawSteps[nextIdx - 1]?.id]?.page ?? rawSteps[nextIdx - 1]?.page;
    if (nextPage && nextPage !== "current" && nextPage !== pathname) {
      router.replace(nextPage);
    }

    persistStep(nextIdx);
  }, [tourStatus, currentStepIndex, totalSteps, rawSteps, stepOverrides, pathname, router, persistStep, prepareStepSideEffects, clearStepResidue]);

  const prevStep = useCallback(() => {
    if (tourStatus !== "active") return;
    if (currentStepIndex <= 1) return;
    clearStepResidue();

    const prevIdx = currentStepIndex - 1;
    setCurrentStepIndex(prevIdx);
    prepareStepSideEffects(prevIdx);

    const prevPage = stepOverrides[rawSteps[prevIdx - 1]?.id]?.page ?? rawSteps[prevIdx - 1]?.page;
    if (prevPage && prevPage !== "current" && prevPage !== pathname) {
      router.replace(prevPage);
    }

    persistStep(prevIdx);
  }, [tourStatus, currentStepIndex, rawSteps, stepOverrides, pathname, router, persistStep, prepareStepSideEffects, clearStepResidue]);

  const skipTour = useCallback(async () => {
    clearStepResidue();
    setTourStatus("idle");
    setCurrentStepIndex(0);

    // Optimistically update local state so the tour can't re-trigger
    // on a hard navigation before the server persist completes.
    setOnboardingState((prev) => prev ? {
      ...prev,
      tourCompleted: true,
      tourSkipped: true,
    } : {
      tourCompleted: true,
      currentStep: 0,
      completedSteps: [],
      hintsDismissed: [],
      tourSkipped: true,
    });

    try {
      const updated = await updateOnboardingState({
        tourCompleted: true,
        tourSkipped: true,
        currentStep: currentStepIndex || 1,
      });
      setOnboardingState(updated);
    } catch (err) {
      console.error("[OnboardingProvider] Failed to persist skip tour:", err);
    }
  }, [currentStepIndex, clearStepResidue]);

  const pauseTour = useCallback(() => {
    if (tourStatus !== "active") return;
    setTourStatus("paused");
  }, [tourStatus]);

  const resumeTour = useCallback(() => {
    if (tourStatus !== "paused") return;
    setTourStatus("active");
  }, [tourStatus]);

  const completeTour = useCallback(async () => {
    clearStepResidue();
    setTourStatus("completed");
    setCurrentStepIndex(0);

    // Optimistically update local state
    setOnboardingState((prev) => prev ? {
      ...prev,
      tourCompleted: true,
      completedSteps: rawSteps.map((s) => s.id),
    } : {
      tourCompleted: true,
      currentStep: totalSteps,
      completedSteps: rawSteps.map((s) => s.id),
      hintsDismissed: [],
      tourSkipped: false,
    });

    try {
      const updated = await updateOnboardingState({
        tourCompleted: true,
        currentStep: totalSteps,
        completedSteps: rawSteps.map((s) => s.id),
      });
      setOnboardingState(updated);
    } catch (err) {
      console.error("[OnboardingProvider] Failed to persist tour completion:", err);
    }
  }, [rawSteps, totalSteps, clearStepResidue]);

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

  const refreshOnboardingState = useCallback((state: OnboardingState) => {
    setOnboardingState(state);
  }, []);

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
      refreshOnboardingState,
    }),
    [
      tourStatus, currentStepIndex, totalSteps, steps, currentStep,
      onboardingState, loading, startTour, nextStep, prevStep,
      skipTour, pauseTour, resumeTour, completeTour, isMobile,
      refreshOnboardingState,
    ],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}
