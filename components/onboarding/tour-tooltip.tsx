"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "./onboarding-provider";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* TourTooltip                                                                 */
/* -------------------------------------------------------------------------- */

export function TourTooltip() {
  const {
    tourStatus,
    currentStepIndex,
    totalSteps,
    currentStep,
    nextStep,
    prevStep,
    skipTour,
    isMobile,
  } = useOnboarding();

  /* ---- don't render when tour is not active ---- */
  if (tourStatus !== "active" || isMobile || !currentStep || currentStepIndex === 0) {
    return null;
  }

  const isWelcomeStep = currentStep.targetSelector === null;
  const isFirstStep = currentStepIndex === 1;
  const isLastStep = currentStepIndex === totalSteps;

  if (isWelcomeStep) {
    return (
      <WelcomeDialog
        step={currentStep}
        stepIndex={currentStepIndex}
        totalSteps={totalSteps}
        isFirstStep={isFirstStep}
        isLastStep={isLastStep}
        onNext={nextStep}
        onPrev={prevStep}
        onSkip={skipTour}
      />
    );
  }

  return (
    <SpotlightTooltip
      step={currentStep}
      stepIndex={currentStepIndex}
      totalSteps={totalSteps}
      isFirstStep={isFirstStep}
      isLastStep={isLastStep}
      onNext={nextStep}
      onPrev={prevStep}
      onSkip={skipTour}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Welcome Dialog (centered, no spotlight)                                     */
/* -------------------------------------------------------------------------- */

function WelcomeDialog({
  step,
  stepIndex,
  totalSteps,
  isFirstStep,
  isLastStep,
  onNext,
  onPrev,
  onSkip,
}: TooltipProps) {
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
    >
      <div
        className="relative w-full max-w-md rounded-lg border bg-background p-6 shadow-lg"
        style={{ zIndex: 10001 }}
      >
        <div aria-live="polite" className="sr-only">
          Step {stepIndex} of {totalSteps}: {step.title}. {step.description}
        </div>

        <h2 className="text-lg font-semibold">{step.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>

        <StepCounter current={stepIndex} total={totalSteps} className="mt-3" />

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground underline"
            onClick={onSkip}
          >
            Skip Tour
          </button>

          <div className="flex gap-2">
            {!isFirstStep && (
              <Button variant="outline" size="sm" onClick={onPrev}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={onNext}>
              {isLastStep ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Spotlight Tooltip (positioned near target)                                  */
/* -------------------------------------------------------------------------- */

interface TooltipProps {
  step: NonNullable<ReturnType<typeof useOnboarding>["currentStep"]>;
  stepIndex: number;
  totalSteps: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

function SpotlightTooltip({
  step,
  stepIndex,
  totalSteps,
  isFirstStep,
  isLastStep,
  onNext,
  onPrev,
  onSkip,
}: TooltipProps) {
  const [anchorPos, setAnchorPos] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [side, setSide] = useState<"top" | "bottom">("bottom");
  const tooltipRef = useRef<HTMLDivElement>(null);

  /* ---- measure target element ---- */
  useEffect(() => {
    if (!step.targetSelector) return;

    function measure() {
      const el = document.querySelector(step.targetSelector!);
      if (!el) return;
      const rect = el.getBoundingClientRect();

      // Determine which side has more space
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const newSide = spaceBelow >= 200 ? "bottom" : spaceAbove >= 200 ? "top" : "bottom";

      setAnchorPos({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
      setSide(newSide);
    }

    // Initial measurement
    const timer = setTimeout(measure, 120);

    // Re-measure on resize and scroll
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step.targetSelector, stepIndex]);

  if (!anchorPos) return null;

  const tooltipTop = side === "bottom"
    ? anchorPos.top + anchorPos.height + 12
    : anchorPos.top - 12; // will be adjusted by transform

  const transform = side === "top" ? "translateY(-100%)" : "none";

  return (
    <div
      className="fixed z-[10000]"
      style={{
        top: tooltipTop,
        left: anchorPos.left,
        width: Math.max(anchorPos.width, 300),
        maxWidth: Math.min(400, window.innerWidth - 32),
        transform,
      }}
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
    >
      <div
        ref={tooltipRef}
        className="rounded-lg border bg-background p-4 shadow-lg"
      >
        <div aria-live="polite" className="sr-only">
          Step {stepIndex} of {totalSteps}: {step.title}. {step.description}
        </div>

        <h3 className="text-sm font-semibold">{step.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>

        <StepCounter current={stepIndex} total={totalSteps} className="mt-2" />

        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={onSkip}
          >
            Skip Tour
          </button>

          <div className="flex gap-2">
            {!isFirstStep && (
              <Button variant="outline" size="sm" onClick={onPrev}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={onNext}>
              {isLastStep ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step Counter                                                                */
/* -------------------------------------------------------------------------- */

function StepCounter({
  current,
  total,
  className,
}: {
  current: number;
  total: number;
  className?: string;
}) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {current} of {total}
    </p>
  );
}
