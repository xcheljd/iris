"use client";

import { useCallback, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { CheckCircle2, Circle, GraduationCap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { updateOnboardingState, type OnboardingState } from "@/lib/actions/onboarding";
import { useOnboarding } from "./onboarding-provider";
import { getStepsForRole } from "./tour-steps";
import type { HintId } from "./hint-definitions";
import { toast } from "sonner";

/* -------------------------------------------------------------------------- */
/* OnboardingSettingsTab                                                       */
/*                                                                            */
/* Onboarding tab in Settings page showing tour status, step progress, and    */
/* Replay/Start Tour button with confirmation dialog.                         */
/* -------------------------------------------------------------------------- */

interface OnboardingSettingsTabProps {
  // Server-fetched initial state — bypasses the provider's loading skeleton on first paint.
  initialState?: OnboardingState | null;
}

export function OnboardingSettingsTab({ initialState }: OnboardingSettingsTabProps = {}) {
  const { tourStatus, onboardingState, loading, startTour, refreshOnboardingState } = useOnboarding();
  const { data: session } = useSession();
  const role = session?.user?.role ?? "associate";

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  /* ---- derived state ---- */

  const steps = useMemo(() => getStepsForRole(role), [role]);

  const isTourActive = tourStatus === "active";

  // Use initialState until the provider finishes its session + getOnboardingState chain.
  const effectiveState = loading && initialState !== undefined ? initialState : onboardingState;

  const tourCompleted = effectiveState?.tourCompleted ?? false;
  const tourSkipped = effectiveState?.tourSkipped ?? false;
  const completedSteps: string[] = effectiveState?.completedSteps ?? [];

  // Button text adapts to state:
  // "Start Tour" if never completed or skipped, "Replay Tour" if completed
  const showReplay = tourCompleted && !tourSkipped;
  const buttonText = showReplay ? "Replay Tour" : "Start Tour";

  /* ---- handlers ---- */

  // Confirming resets tour state but preserves hintsDismissed
  const handleConfirm = useCallback(async () => {
    setResetting(true);
    try {
      const hints = effectiveState?.hintsDismissed ?? [];
      const updated = await updateOnboardingState({
        tourCompleted: false,
        completedSteps: [],
        // Omit currentStep — the server action defaults to current value when not provided.
        // Sending currentStep: 0 would violate the Zod schema (.min(1)).
        hintsDismissed: hints as HintId[],
        tourSkipped: false,
      });
      // Pipe the reset state back into the provider so the tab reflects it immediately
      refreshOnboardingState(updated);
      setConfirmOpen(false);
      startTour(1);
    } catch {
      // Server reset failed — do NOT start tour to avoid client/server state desync.
      setConfirmOpen(false);
      toast.error("Failed to reset tour. Please try again.");
      return;
    } finally {
      setResetting(false);
    }
  }, [effectiveState?.hintsDismissed, startTour, refreshOnboardingState]);

  /* ---- render ---- */

  if (loading && initialState === undefined) {
    // Mirror the two-Card layout below so the skeleton occupies the same
    // shape as the loaded state — no layout shift on hydrate.
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-9 w-32" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="size-4 rounded-full" />
                  <Skeleton className="h-4 w-56" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tour overview — status + action */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="size-5" />
            Guided Tour
          </CardTitle>
          <CardDescription>
            A step-by-step walkthrough of the key features in Iris.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            {tourCompleted && !tourSkipped ? (
              <>
                <CheckCircle2 className="size-5 text-green-500" />
                <span className="text-sm font-medium">Completed</span>
              </>
            ) : (
              <>
                <Circle className="size-5 text-muted-foreground" />
                <span className="text-sm font-medium">Not Completed</span>
              </>
            )}
          </div>
          {isTourActive ? (
            <Button disabled variant="outline" className="gap-2">
              <Loader2 className="size-4 animate-spin" />
              Tour in Progress
            </Button>
          ) : (
            <Button onClick={() => setConfirmOpen(true)} className="gap-2">
              <GraduationCap className="size-4" />
              {buttonText}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Step progress */}
      <Card>
        <CardHeader>
          <CardTitle>Step Progress</CardTitle>
          <CardDescription>{steps.length} steps total</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {steps.map((step) => {
              const isCompleted = completedSteps.includes(step.id);
              return (
                <li key={step.id} className="flex items-center gap-3 text-sm">
                  <span
                    data-testid={`step-indicator-${step.id}`}
                    data-completed={isCompleted ? "true" : "false"}
                    className="shrink-0"
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="size-4 text-green-500" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground" />
                    )}
                  </span>
                  <span className={isCompleted ? "text-foreground" : "text-muted-foreground"}>
                    {step.title}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Confirmation dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChangeAction={setConfirmOpen}
        title={showReplay ? "Replay Tour?" : "Start Tour?"}
        description={
          showReplay
            ? "This will reset your tour progress and guide you through the app again from the beginning. Your current progress will be lost."
            : "This will start a guided tour of the app from the beginning."
        }
        confirmLabel={showReplay ? "Replay" : "Start"}
        onConfirmAction={handleConfirm}
        disabled={resetting}
      />
    </div>
  );
}
