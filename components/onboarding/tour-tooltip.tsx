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
    resumeTour,
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
      onResume={resumeTour}
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

        <div className="mt-4 flex items-center justify-between" data-tour-tooltip-controls>
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground underline"
            onClick={onSkip}
            style={{ minHeight: 44, minWidth: 44, display: "inline-flex", alignItems: "center" }}
          >
            Skip Tour
          </button>

          <div className="flex gap-2">
            {!isFirstStep && (
              <Button variant="outline" size="sm" onClick={onPrev} style={{ minHeight: 44, minWidth: 44 }}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={onNext} style={{ minHeight: 44, minWidth: 44 }}>
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
  onResume?: () => void;
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
  onResume: _onResume,
}: TooltipProps) {
  const [anchorPos, setAnchorPos] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [side, setSide] = useState<"top" | "bottom">("bottom");
  const [waitingForElement, setWaitingForElement] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  /* ---- measure target element ---- */
  useEffect(() => {
    if (!step.targetSelector) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    function measure() {
      const el = document.querySelector(step.targetSelector!);
      if (!el) return false;
      const rect = el.getBoundingClientRect();

      // If the element spans most of the viewport height (>70%), clamp the anchor rect
      // so the tooltip positions relative to the top portion rather than the full extent.
      const vh = window.innerHeight;
      const clampThreshold = vh * 0.7;
      const top = rect.top;
      let height = rect.height;
      if (rect.height > clampThreshold) {
        height = Math.min(rect.height, 80);
      }

      // Determine which side has more space; when neither has 200px pick the larger side
      const spaceBelow = vh - (top + height);
      const spaceAbove = top;
      const newSide = spaceBelow >= 200 ? "bottom" : spaceAbove >= 200 ? "top" : (spaceBelow >= spaceAbove ? "bottom" : "top");

      setAnchorPos({ top, left: rect.left, width: rect.width, height });
      setSide(newSide);
      return true;
    }

    function cleanup() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    }

    function startPolling() {
      // Try immediate measurement first
      if (measure()) {
        setWaitingForElement(false);
        return;
      }

      // Element not in DOM yet — start MutationObserver-based polling
      setWaitingForElement(true);

      const timeout = 5000; // 5s max wait for page transitions
      const startTime = Date.now();

      observer = new MutationObserver(() => {
        if (cancelled) return;
        if (measure()) {
          setWaitingForElement(false);
          cleanup();
        } else if (Date.now() - startTime >= timeout) {
          // Timed out — advance to the next step (don't skip the entire tour)
          setWaitingForElement(false);
          cleanup();
          // eslint-disable-next-line no-console
          console.warn(`[Tour] Target element "${step.targetSelector}" not found after 5s — advancing to next step`);
          onNext();
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      // Also poll periodically as a fallback (MutationObserver may miss some cases)
      const poll = () => {
        if (cancelled) return;
        if (measure()) {
          setWaitingForElement(false);
          cleanup();
        } else if (Date.now() - startTime >= timeout) {
          setWaitingForElement(false);
          cleanup();
          // eslint-disable-next-line no-console
          console.warn(`[Tour] Target element "${step.targetSelector}" not found after 5s — advancing to next step`);
          onNext();
        } else {
          pollTimer = setTimeout(poll, 100);
        }
      };
      pollTimer = setTimeout(poll, 100);
    }

    // Initial measurement with slight delay to allow DOM to settle after navigation
    const timer = setTimeout(() => {
      if (!cancelled) startPolling();
    }, 120);

    // Re-measure on resize and scroll
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      cleanup();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step.targetSelector, stepIndex, onNext]);

  if (!anchorPos) {
    // While waiting for the target element to appear, show a loading indicator
    // This prevents the tooltip from returning null during page transitions
    if (waitingForElement) {
      return (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center"
          role="status"
          aria-live="polite"
          aria-label="Loading tour step"
        >
          <div className="rounded-lg border bg-background p-4 shadow-lg">
            <p className="text-sm text-muted-foreground">Loading step...</p>
          </div>
        </div>
      );
    }
    return null;
  }

  const tooltipTop = side === "bottom"
    ? anchorPos.top + anchorPos.height + 12
    : anchorPos.top - 12; // will be adjusted by transform

  const transform = side === "top" ? "translateY(-100%)" : "none";

  const vw = window.innerWidth;
  const tooltipWidth = Math.min(Math.max(anchorPos.width, 300), Math.min(400, vw - 32));
  const clampedLeft = Math.max(8, Math.min(anchorPos.left, vw - tooltipWidth - 8));

  return (
    <div
      className="fixed z-[10000]"
      style={{
        top: tooltipTop,
        left: clampedLeft,
        width: tooltipWidth,
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

        <div className="mt-3 flex items-center justify-between" data-tour-tooltip-controls>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={onSkip}
            style={{ minHeight: 44, minWidth: 44, display: "inline-flex", alignItems: "center" }}
          >
            Skip Tour
          </button>

          <div className="flex gap-2">
            {!isFirstStep && (
              <Button variant="outline" size="sm" onClick={onPrev} style={{ minHeight: 44, minWidth: 44 }}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={onNext} style={{ minHeight: 44, minWidth: 44 }}>
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
