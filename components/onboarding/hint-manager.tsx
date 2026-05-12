"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useOnboarding } from "./onboarding-provider";
import { getShortcutText, getHintsForPath, type HintDefinition } from "./hint-definitions";
import { updateOnboardingState } from "@/lib/actions/onboarding";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type HintId = "add-client" | "edit-client" | "log-outreach" | "command-palette";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/* -------------------------------------------------------------------------- */
/* HintManager                                                                 */
/*                                                                            */
/* Renders contextual hints as spotlight + popover overlays after tour         */
/* completion. Each hint is page-scoped and dismisses permanently.             */
/* Does NOT render below 768px viewport width.                                */
/* -------------------------------------------------------------------------- */

export function HintManager() {
  const { tourStatus, onboardingState, isMobile } = useOnboarding();
  const pathname = usePathname();

  // Don't render if: mobile, tour active/paused, tour not completed, or loading
  const tourCompleted = onboardingState?.tourCompleted === true;
  const shouldRender = !isMobile && tourCompleted && tourStatus !== "active" && tourStatus !== "paused";

  if (!shouldRender) return null;

  return <HintRenderer pathname={pathname} hintsDismissed={onboardingState?.hintsDismissed ?? []} />;
}

/* -------------------------------------------------------------------------- */
/* HintRenderer — manages which hints to show for the current page             */
/* -------------------------------------------------------------------------- */

function HintRenderer({ pathname, hintsDismissed }: { pathname: string; hintsDismissed: string[] }) {
  const activeHints = useMemo(() => {
    const pageHints = getHintsForPath(pathname);
    return pageHints.filter((h) => !hintsDismissed.includes(h.id));
  }, [pathname, hintsDismissed]);

  if (activeHints.length === 0) return null;

  return (
    <>
      {activeHints.map((hint) => (
        <HintOverlay key={hint.id} hint={hint} />
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Single Hint Overlay — spotlight + popover for one hint                      */
/* -------------------------------------------------------------------------- */

function HintOverlay({ hint }: { hint: HintDefinition }) {
  const { onboardingState } = useOnboarding();
  const [dismissed, setDismissed] = useState(false);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [side, setSide] = useState<"top" | "bottom">("bottom");
  const [reducedMotion, setReducedMotion] = useState(false);
  const dismissedRef = useRef(false);

  /* ---- reduced motion detection ---- */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  /* ---- track target element ---- */
  const measureTarget = useCallback(() => {
    const el = document.querySelector(hint.targetSelector);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });

    // Determine side based on available space
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setSide(spaceBelow >= 160 ? "bottom" : spaceAbove >= 160 ? "top" : "bottom");
    return true;
  }, [hint.targetSelector]);

  useEffect(() => {
    if (dismissed) return;

    let observer: MutationObserver | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    // Try to find the target element
    const tryMeasure = () => {
      if (dismissedRef.current) return;
      measureTarget();
    };

    // Initial measurement — try immediately and after a short delay
    tryMeasure();

    // Set up delayed initial measurement
    const timer = setTimeout(() => {
      tryMeasure();
    }, 50);

    // Set up MutationObserver for DOM changes
    observer = new MutationObserver(() => {
      tryMeasure();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Periodic re-measurement to track position changes (replaces rAF for testability)
    intervalId = setInterval(tryMeasure, 200);

    // Re-measure on resize
    window.addEventListener("resize", tryMeasure);

    return () => {
      clearTimeout(timer);
      if (observer) observer.disconnect();
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener("resize", tryMeasure);
    };
  }, [dismissed, measureTarget, hint.targetSelector]);

  /* ---- dismiss handler ---- */
  const dismissHint = useCallback(async () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setDismissed(true);

    // Optimistic update — persist to server
    try {
      const existing = onboardingState?.hintsDismissed ?? [];
      if (!existing.includes(hint.id)) {
        await updateOnboardingState({
          hintsDismissed: [...existing, hint.id] as HintId[],
        });
      }
    } catch {
      // Optimistic dismissal — visual state already updated
    }
  }, [hint.id, onboardingState?.hintsDismissed]);

  /* ---- Escape key handler ---- */
  useEffect(() => {
    if (dismissed || !targetRect) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();

        // Move focus to target element before dismissing
        const target = document.querySelector(hint.targetSelector);
        if (target instanceof HTMLElement) {
          target.focus();
        }

        dismissHint();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [dismissed, targetRect, hint.targetSelector, dismissHint]);

  /* ---- Cmd+K handler for command-palette hint ---- */
  useEffect(() => {
    if (dismissed || hint.id !== "command-palette") return;

    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        // Dismiss the hint but let the keyboard event propagate so the
        // command palette still opens
        dismissHint();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [dismissed, hint.id, dismissHint]);

  /* ---- don't render if dismissed or target not found ---- */
  if (dismissed) return null;
  if (!targetRect) return null;

  const padding = 6;

  return (
    <>
      {/* Dark backdrop */}
      <div
        className="fixed inset-0 z-[9996]"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }}
        aria-hidden="true"
        onClick={dismissHint}
      />

      {/* Spotlight cutout */}
      <HintSpotlight
        rect={targetRect}
        padding={padding}
        reducedMotion={reducedMotion}
        onDismiss={dismissHint}
        hintId={hint.id}
      />

      {/* Positioned popover */}
      <HintPopover
        hint={hint}
        rect={targetRect}
        padding={padding}
        side={side}
        onDismiss={dismissHint}
      />

      {/* Screen reader announcement */}
      <div aria-live="polite" className="sr-only">
        Hint: {hint.title} — {hint.description.replace("{shortcut}", getShortcutText())}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Hint Spotlight                                                              */
/* -------------------------------------------------------------------------- */

function HintSpotlight({
  rect,
  padding,
  reducedMotion,
  onDismiss,
  hintId,
}: {
  rect: Rect;
  padding: number;
  reducedMotion: boolean;
  onDismiss: () => void;
  hintId: string;
}) {
  const style: React.CSSProperties = useMemo(() => ({
    position: "fixed",
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
    zIndex: 9997,
    borderRadius: 6,
    pointerEvents: "auto",
    cursor: "pointer",
    boxShadow: reducedMotion
      ? `0 0 0 2px hsl(var(--primary)), 0 0 0 9999px rgba(0, 0, 0, 0.3)`
      : undefined,
    animation: reducedMotion ? "none" : "hint-pulse 2s ease-in-out infinite",
  }), [rect, padding, reducedMotion]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDismiss();
  }, [onDismiss]);

  return (
    <>
      {!reducedMotion && <HintPulseKeyframes />}
      <div
        style={style}
        role="presentation"
        aria-hidden="true"
        data-hint-spotlight={hintId}
        onClick={handleClick}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Hint Popover                                                                */
/* -------------------------------------------------------------------------- */

function HintPopover({
  hint,
  rect,
  padding,
  side,
  onDismiss,
}: {
  hint: HintDefinition;
  rect: Rect;
  padding: number;
  side: "top" | "bottom";
  onDismiss: () => void;
}) {
  const shortcutText = getShortcutText();
  const description = hint.description.replace("{shortcut}", shortcutText);

  const popoverTop = side === "bottom"
    ? rect.top + rect.height + padding + 8
    : rect.top - padding - 8;

  const transform = side === "top" ? "translateY(-100%)" : "none";

  return (
    <div
      className="fixed z-[9998]"
      style={{
        top: popoverTop,
        left: rect.left,
        width: Math.max(rect.width, 280),
        maxWidth: Math.min(360, window.innerWidth - 32),
        transform,
      }}
      role="tooltip"
      aria-describedby={`hint-content-${hint.id}`}
    >
      <div
        id={`hint-content-${hint.id}`}
        className="rounded-lg border bg-background p-3 shadow-lg"
      >
        <h4 className="text-sm font-semibold">{hint.title}</h4>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        <button
          type="button"
          className="mt-2 text-xs text-muted-foreground hover:text-foreground underline"
          onClick={onDismiss}
          style={{ minHeight: 44, minWidth: 44, display: "inline-flex", alignItems: "center" }}
          aria-label={`Dismiss ${hint.title} hint`}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pulse keyframes for hint spotlight                                          */
/* -------------------------------------------------------------------------- */

let hintKeyframesInjected = false;

function HintPulseKeyframes() {
  useEffect(() => {
    if (hintKeyframesInjected) return;
    hintKeyframesInjected = true;
    const sheet = document.createElement("style");
    sheet.textContent = `
      @keyframes hint-pulse {
        0%, 100% {
          box-shadow: 0 0 0 2px hsl(var(--primary)), 0 0 0 9999px rgba(0, 0, 0, 0.3);
        }
        50% {
          box-shadow: 0 0 0 4px hsl(var(--primary)), 0 0 0 9999px rgba(0, 0, 0, 0.3);
        }
      }
    `;
    document.head.appendChild(sheet);
    return () => {
      hintKeyframesInjected = false;
      document.head.removeChild(sheet);
    };
  }, []);

  return null;
}
