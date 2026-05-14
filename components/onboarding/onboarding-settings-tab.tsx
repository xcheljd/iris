"use client";

import { useCallback, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { CheckCircle2, Circle, GraduationCap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateOnboardingState } from "@/lib/actions/onboarding";
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

export function OnboardingSettingsTab() {
  const { tourStatus, onboardingState, loading, startTour } = useOnboarding();
  const { data: session } = useSession();
  const role = session?.user?.role ?? "associate";

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  /* ---- derived state ---- */

  const steps = useMemo(() => getStepsForRole(role), [role]);

  const isTourActive = tourStatus === "active";

  const tourCompleted = onboardingState?.tourCompleted ?? false;
  const tourSkipped = onboardingState?.tourSkipped ?? false;
  const completedSteps: string[] = onboardingState?.completedSteps ?? [];

  // Button text adapts to state:
  // "Start Tour" if never completed or skipped, "Replay Tour" if completed
  const showReplay = tourCompleted && !tourSkipped;
  const buttonText = showReplay ? "Replay Tour" : "Start Tour";

  /* ---- handlers ---- */

  // Confirming resets tour state but preserves hintsDismissed
  const handleConfirm = useCallback(async () => {
    setResetting(true);
    try {
      const hints = onboardingState?.hintsDismissed ?? [];
      await updateOnboardingState({
        tourCompleted: false,
        completedSteps: [],
        // Omit currentStep — the server action defaults to current value when not provided.
        // Sending currentStep: 0 would violate the Zod schema (.min(1)).
        hintsDismissed: hints as HintId[],
        tourSkipped: false,
      });
      setConfirmOpen(false);
      // Tour starts immediately from step 1
      startTour(1);
    } catch {
      // Server reset failed — do NOT start tour to avoid client/server state desync.
      // Show an error message and close the dialog without starting the tour.
      setConfirmOpen(false);
      toast.error("Failed to reset tour. Please try again.");
      return;
    } finally {
      setResetting(false);
    }
  }, [onboardingState?.hintsDismissed, startTour]);

  /* ---- render ---- */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tour completion status */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Tour Status</h3>
        <div className="flex items-center gap-2">
          {tourCompleted && !tourSkipped ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="text-sm font-medium">Completed</span>
            </>
          ) : (
            <>
              <Circle className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">Not Completed</span>
            </>
          )}
        </div>
      </div>

      {/* Individual step progress */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          Step Progress ({steps.length} steps)
        </h3>
        <ul className="space-y-2">
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
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                </span>
                <span className={isCompleted ? "text-foreground" : "text-muted-foreground"}>
                  {step.title}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Action button */}
      <div>
        {isTourActive ? (
          <Button disabled variant="outline" className="gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Tour in Progress
          </Button>
        ) : (
          <Button onClick={() => setConfirmOpen(true)} className="gap-2">
            <GraduationCap className="h-4 w-4" />
            {buttonText}
          </Button>
        )}
      </div>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          className="sm:max-w-[425px]"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {showReplay ? "Replay Tour?" : "Start Tour?"}
            </DialogTitle>
            <DialogDescription>
              {showReplay
                ? "This will reset your tour progress and guide you through the app again from the beginning. Your current progress will be lost."
                : "This will start a guided tour of the app from the beginning."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={resetting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={resetting}
              className="gap-2"
            >
              {resetting && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
