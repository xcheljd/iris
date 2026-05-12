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

  return (
    <>
      {/* Inject keyframes once */}
      {!reducedMotion && <PulseKeyframes />}
      <div
        style={style}
        role="presentation"
        aria-hidden="true"
        data-tour-spotlight={step?.id ?? "unknown"}
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
