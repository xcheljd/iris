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

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type TourStatus = "idle" | "active" | "paused" | "completed";

/** Hint IDs matching the server action's Zod schema. */
type HintId = "add-client" | "edit-client" | "log-outreach" | "command-palette";

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
            // Resume from persisted step
            setCurrentStepIndex(state.currentStep);
            setTourStatus("active");
          }
        }
      } catch {
        // Server action failure — continue without tour
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
    },
    [isMobile, totalSteps],
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
      } catch {
        // Silently continue on server failure
      } finally {
        persistingRef.current = false;
      }
    },
    [steps, onboardingState],
  );

  const nextStep = useCallback(async () => {
    if (tourStatus !== "active") return;

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
      } catch {
        // continue locally
      }
      return;
    }

    const nextIdx = currentStepIndex + 1;
    setCurrentStepIndex(nextIdx);

    const nextStepDef = steps[nextIdx - 1];
    if (nextStepDef && nextStepDef.page !== "current" && nextStepDef.page !== pathname) {
      router.replace(nextStepDef.page);
    }

    persistStep(nextIdx);
  }, [tourStatus, currentStepIndex, totalSteps, steps, pathname, router, persistStep]);

  const prevStep = useCallback(() => {
    if (tourStatus !== "active") return;
    if (currentStepIndex <= 1) return;

    const prevIdx = currentStepIndex - 1;
    setCurrentStepIndex(prevIdx);

    const prevStepDef = steps[prevIdx - 1];
    if (prevStepDef && prevStepDef.page !== "current" && prevStepDef.page !== pathname) {
      router.replace(prevStepDef.page);
    }

    persistStep(prevIdx);
  }, [tourStatus, currentStepIndex, steps, pathname, router, persistStep]);

  const skipTour = useCallback(async () => {
    setTourStatus("idle");
    setCurrentStepIndex(0);

    try {
      const updated = await updateOnboardingState({
        tourCompleted: true,
        tourSkipped: true,
        currentStep: currentStepIndex || 1,
      });
      setOnboardingState(updated);
    } catch {
      // continue locally
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
    } catch {
      // continue locally
    }
  }, [steps, totalSteps]);

  /* ---- keyboard handling ---- */
  useEffect(() => {
    if (tourStatus !== "active") return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
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
