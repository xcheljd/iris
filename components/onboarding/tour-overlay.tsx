"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOnboarding } from "./onboarding-provider";
import type { TourStep } from "./tour-steps";

/* -------------------------------------------------------------------------- */
/* Spotlight rect                                                              */
/* -------------------------------------------------------------------------- */

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getElementRect(selector: string | null): Rect | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const { top, left, width, height } = el.getBoundingClientRect();
  return { top, left, width, height };
}

/* -------------------------------------------------------------------------- */
/* Focus trap hook                                                             */
/*                                                                            */
/* Traps Tab/Shift+Tab within tour tooltip controls and the spotlight element */
/* during active spotlight steps.                                              */
/* -------------------------------------------------------------------------- */

function useFocusTrap(isActive: boolean, isSpotlightStep: boolean) {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive || !isSpotlightStep) return;

    // Save the currently focused element to restore later
    previouslyFocusedRef.current = document.activeElement as HTMLElement;

    // Focus the first focusable tour element after a brief delay to let tooltip render
    const focusTimer = setTimeout(() => {
      const focusable = getFocusableElements();
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }, 200);

    function getFocusableElements(): HTMLElement[] {
      const elements: HTMLElement[] = [];
      // Tour tooltip controls (buttons and skip link)
      const tooltipContainer = document.querySelector("[data-tour-tooltip-controls]");
      if (tooltipContainer) {
        const focusable = tooltipContainer.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        focusable.forEach((el) => elements.push(el));
      }
      // Spotlight element (the clickable highlighted area)
      const spotlight = document.querySelector("[data-tour-spotlight]");
      if (spotlight instanceof HTMLElement) {
        // Make spotlight focusable for the duration of the step
        if (spotlight.getAttribute("tabindex") === null) {
          spotlight.setAttribute("tabindex", "0");
        }
        elements.push(spotlight);
      }
      return elements;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      // Always prevent default to stop Tab from escaping to underlying page elements
      e.preventDefault();
      e.stopPropagation();
      // Stop immediate propagation to prevent any other handlers from processing this Tab
      e.stopImmediatePropagation();

      const activeElement = document.activeElement;
      const currentIndex = focusable.indexOf(activeElement as HTMLElement);
      const isShift = e.shiftKey;

      let nextIndex: number;
      if (currentIndex === -1) {
        // Not currently on a focusable element — go to first or last
        nextIndex = isShift ? focusable.length - 1 : 0;
      } else if (isShift) {
        // Shift+Tab: go backwards, wrapping to last
        nextIndex = currentIndex > 0 ? currentIndex - 1 : focusable.length - 1;
      } else {
        // Tab: go forwards, wrapping to first
        nextIndex = currentIndex < focusable.length - 1 ? currentIndex + 1 : 0;
      }

      focusable[nextIndex].focus();
    }

    // Focusin handler: if focus escapes to a non-tour element, snap it back
    function handleFocusIn(e: FocusEvent) {
      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const target = e.target as HTMLElement;
      // Check if focus landed on a tour element
      const isTourElement = focusable.includes(target)
        || target.closest("[data-tour-tooltip-controls]")
        || target.closest("[data-tour-spotlight]");

      if (!isTourElement) {
        // Focus escaped — snap it back to the first focusable tour element
        e.preventDefault();
        e.stopPropagation();
        focusable[0].focus();
      }
    }

    // Use capture phase to intercept Tab before any other handler
    document.addEventListener("keydown", handleKeyDown, true);
    // Also catch focusin to handle cases where focus escapes via other means (mouse, etc.)
    document.addEventListener("focusin", handleFocusIn, true);

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      // Restore tabindex on spotlight element
      const spotlight = document.querySelector("[data-tour-spotlight]");
      if (spotlight instanceof HTMLElement) {
        spotlight.removeAttribute("tabindex");
      }
    };
  }, [isActive, isSpotlightStep]);

  // Restore focus when the tour step dismisses
  useEffect(() => {
    if (!isActive && previouslyFocusedRef.current) {
      // Use requestAnimationFrame to avoid React batching issues
      const el = previouslyFocusedRef.current;
      const raf = requestAnimationFrame(() => {
        if (el && el.isConnected) {
          el.focus();
        } else {
          // Fallback: focus the body or the main content area
          const mainContent = document.querySelector("main") || document.body;
          mainContent.focus();
        }
        previouslyFocusedRef.current = null;
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isActive]);
}

/* -------------------------------------------------------------------------- */
/* TourOverlay                                                                 */
/* -------------------------------------------------------------------------- */

export function TourOverlay() {
  const {
    tourStatus,
    currentStepIndex,
    currentStep,
    isMobile,
  } = useOnboarding();

  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const rafRef = useRef<number>(0);

  const isSpotlightStep = tourStatus === "active" && currentStepIndex > 0 && currentStep?.targetSelector !== null;

  // Activate focus trap during spotlight steps
  useFocusTrap(tourStatus === "active", isSpotlightStep);

  /* ---- reduced motion detection ---- */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  /* ---- track target element position ---- */
  const updateRect = useCallback(() => {
    if (!currentStep?.targetSelector) {
      setTargetRect(null);
      return false;
    }

    // Scroll target into view first
    const el = document.querySelector(currentStep.targetSelector);
    if (el) {
      el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    }

    const rect = getElementRect(currentStep.targetSelector);
    setTargetRect(rect);
    return rect !== null;
  }, [currentStep?.targetSelector, reducedMotion]);

  useEffect(() => {
    if (tourStatus !== "active" || isMobile) return;

    let observer: MutationObserver | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    // Initial measurement with a slight delay to allow DOM to settle after navigation
    const timer = setTimeout(() => {
      const found = updateRect();

      // If element not found immediately, start polling with MutationObserver
      if (!found && currentStep?.targetSelector) {
        const startTime = Date.now();
        const TIMEOUT = 2000;

        observer = new MutationObserver(() => {
          if (updateRect()) {
            if (observer) { observer.disconnect(); observer = null; }
            if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        const poll = () => {
          if (updateRect()) {
            if (observer) { observer.disconnect(); observer = null; }
          } else if (Date.now() - startTime < TIMEOUT) {
            pollTimer = setTimeout(poll, 100);
          }
        };
        pollTimer = setTimeout(poll, 100);
      }
    }, 100);

    // Continuously track via rAF (for position changes, resize, etc.)
    const loop = () => {
      updateRect();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const onResize = () => updateRect();
    window.addEventListener("resize", onResize);

    return () => {
      clearTimeout(timer);
      if (pollTimer) clearTimeout(pollTimer);
      if (observer) observer.disconnect();
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [tourStatus, isMobile, currentStepIndex, updateRect, currentStep?.targetSelector]);

  /* ---- don't render if conditions not met ---- */
  if (tourStatus !== "active" || isMobile || currentStepIndex === 0) {
    return null;
  }

  const isWelcomeStep = currentStep?.targetSelector === null;

  return (
    <>
      {/* Dark backdrop */}
      <div
        className="fixed inset-0 z-[9998]"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.5)",
        }}
        aria-hidden="true"
      />

      {/* Spotlight cutout */}
      {!isWelcomeStep && targetRect && (
        <Spotlight
          rect={targetRect}
          reducedMotion={reducedMotion}
          step={currentStep}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Spotlight                                                                   */
/* -------------------------------------------------------------------------- */

function Spotlight({
  rect,
  reducedMotion,
  step,
}: {
  rect: Rect;
  reducedMotion: boolean;
  step: TourStep | null;
}) {
  const { nextStep } = useOnboarding();
  const padding = 8;

  const style: React.CSSProperties = useMemo(() => {
    return {
      position: "fixed",
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
      zIndex: 9999,
      borderRadius: 8,
      pointerEvents: "auto",
      cursor: "pointer",
      // Massive box-shadow creates the spotlight cutout effect
      boxShadow: reducedMotion
        ? `0 0 0 2px hsl(var(--primary)), 0 0 0 9999px rgba(0, 0, 0, 0.5)`
        : undefined,
      animation: reducedMotion ? "none" : "tour-pulse 2s ease-in-out infinite",
    };
  }, [rect, reducedMotion]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Prevent the click from reaching the underlying element
      e.preventDefault();
      e.stopPropagation();
      // Advance to the next tour step
      nextStep();
    },
    [nextStep],
  );

  return (
    <>
      {/* Inject keyframes once */}
      {!reducedMotion && <PulseKeyframes />}
      <div
        style={style}
        role="presentation"
        aria-hidden="true"
        data-tour-spotlight={step?.id ?? "unknown"}
        onClick={handleClick}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Pulse keyframes (injected once)                                             */
/* -------------------------------------------------------------------------- */

let keyframesInjected = false;

function PulseKeyframes() {
  useEffect(() => {
    if (keyframesInjected) return;
    keyframesInjected = true;
    const sheet = document.createElement("style");
    sheet.textContent = `
      @keyframes tour-pulse {
        0%, 100% {
          box-shadow: 0 0 0 2px hsl(var(--primary)), 0 0 0 9999px rgba(0, 0, 0, 0.5);
        }
        50% {
          box-shadow: 0 0 0 6px hsl(var(--primary)), 0 0 0 9999px rgba(0, 0, 0, 0.5);
        }
      }
    `;
    document.head.appendChild(sheet);
    return () => {
      keyframesInjected = false;
      document.head.removeChild(sheet);
    };
  }, []);

  return null;
}

/* -------------------------------------------------------------------------- */
/* Resume Tour Button                                                          */
/*                                                                            */
/* Floating button that appears when the tour is paused via Escape.           */
/* VAL-TOUR-032: Escape pauses tour, this provides a visible UI to resume.    */
/* -------------------------------------------------------------------------- */

export function ResumeTourButton() {
  const { tourStatus, resumeTour, isMobile } = useOnboarding();

  // Only show when paused and not on mobile
  if (tourStatus !== "paused" || isMobile) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={resumeTour}
      className="fixed bottom-6 right-6 z-[10002] flex items-center gap-2 rounded-full border bg-background px-4 py-2.5 shadow-lg transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label="Resume Tour"
      style={{ minHeight: 44, minWidth: 44 }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
      >
        <polygon points="6 3 20 12 6 21 6 3" />
      </svg>
      <span className="text-sm font-medium">Resume Tour</span>
    </button>
  );
}
