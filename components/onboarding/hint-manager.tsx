"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useOnboarding } from "./onboarding-provider";
import { getShortcutText, getHintsForPath, type HintDefinition, type HintId } from "./hint-definitions";
import { updateOnboardingState } from "@/lib/actions/onboarding";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/* -------------------------------------------------------------------------- */
/* Pulse keyframes ref-count injection                                         */
/*                                                                            */
/* Uses a ref-count pattern so the <style> tag is added when the first         */
/* HintSpotlight mounts and removed when the last one unmounts — not tied     */
/* to individual hint mount/unmount lifecycle.                                 */
/* -------------------------------------------------------------------------- */

let pulseRefCount = 0;
let pulseStyleElement: HTMLStyleElement | null = null;

function refCountInject() {
  pulseRefCount++;
  if (pulseRefCount === 1 && !pulseStyleElement) {
    pulseStyleElement = document.createElement("style");
    pulseStyleElement.textContent = `
      @keyframes hint-pulse {
        0%, 100% {
          box-shadow: 0 0 0 2px hsl(var(--primary)), 0 0 0 9999px rgba(0, 0, 0, 0.3);
        }
        50% {
          box-shadow: 0 0 0 4px hsl(var(--primary)), 0 0 0 9999px rgba(0, 0, 0, 0.3);
        }
      }
    `;
    document.head.appendChild(pulseStyleElement);
  }
}

function refCountRelease() {
  pulseRefCount = Math.max(0, pulseRefCount - 1);
  if (pulseRefCount === 0 && pulseStyleElement) {
    document.head.removeChild(pulseStyleElement);
    pulseStyleElement = null;
  }
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

  // Inline HintRenderer logic — compute active hints directly
  const activeHints = useMemo(() => {
    if (!shouldRender) return [];
    const pageHints = getHintsForPath(pathname);
    const hintsDismissed = onboardingState?.hintsDismissed ?? [];
    return pageHints.filter((h) => !hintsDismissed.includes(h.id));
  }, [shouldRender, pathname, onboardingState?.hintsDismissed]);

  if (!shouldRender || activeHints.length === 0) return null;

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
/*                                                                            */
/* Note: useOnboarding() subscribes to the full context — HintOverlay          */
/* re-renders on any context change. A use-context-selector pattern could      */
/* optimize this, but the guard in shouldRender prevents unnecessary work.    */
/* -------------------------------------------------------------------------- */

function HintOverlay({ hint }: { hint: HintDefinition }) {
  // Subscribe to full onboarding context (useOnboarding returns everything)
  const { onboardingState } = useOnboarding();
  const [dismissed, setDismissed] = useState(false);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [side, setSide] = useState<"top" | "bottom">("bottom");
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [reducedMotion, setReducedMotion] = useState(false);
  const dismissedRef = useRef(false);
  const measureRef = useRef<() => void>(() => {});

  /* ---- reduced motion detection ---- */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  /* ---- track target element via single MutationObserver ---- */
  const measureTarget = useCallback(() => {
    if (dismissedRef.current) return false;
    const el = document.querySelector(hint.targetSelector);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    setViewportWidth(window.innerWidth);

    // Determine side based on available space
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setSide(spaceBelow >= 160 ? "bottom" : spaceAbove >= 160 ? "top" : "bottom");
    return true;
  }, [hint.targetSelector]);

  // Keep measureRef current so the observer and resize callbacks always call latest
  measureRef.current = measureTarget;

  useEffect(() => {
    if (dismissed) return;

    // Initial measurement attempt
    measureTarget();

    // Single MutationObserver watches for DOM changes (covers dynamic content, animations, etc.)
    const observer = new MutationObserver(() => {
      measureRef.current();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Resize handler for viewport changes
    const handleResize = () => measureRef.current();
    window.addEventListener("resize", handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
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
    } catch (err) {
      // Optimistic dismissal — visual state already updated, but log for development
      console.error("[HintManager] Failed to persist hint dismissal:", err);
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
        viewportWidth={viewportWidth}
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
  // Ref-count the pulse keyframes injection — inject on mount, release on unmount
  useEffect(() => {
    if (reducedMotion) return;
    refCountInject();
    return () => refCountRelease();
  }, [reducedMotion]);

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
    <div
      style={style}
      role="presentation"
      aria-hidden="true"
      data-hint-spotlight={hintId}
      onClick={handleClick}
    />
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
  viewportWidth,
  onDismiss,
}: {
  hint: HintDefinition;
  rect: Rect;
  padding: number;
  side: "top" | "bottom";
  viewportWidth: number;
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
        maxWidth: Math.min(360, viewportWidth - 32),
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


