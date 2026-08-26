"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import ReactDOM from "react-dom";
import { useNavigationTransition } from "./navigation-transition";

const DURATION = 800;
const MIN_SHOW = 400;

export function NavigationProgress() {
  const { state } = useNavigationTransition();
  const barRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startRef = useRef(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const animate = useCallback((phase: "start" | "finish") => {
    const bar = barRef.current;
    if (!bar) return;

    if (phase === "start") {
      clearTimeout(timerRef.current);
      startRef.current = Date.now();
      bar.style.transition = "none";
      bar.style.opacity = "1";
      bar.style.transform = "translateX(-100%)";
      void bar.offsetWidth;
      bar.style.transition = `transform ${DURATION}ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 300ms ease`;
      bar.style.transform = "translateX(0%)";
    } else {
      const elapsed = Date.now() - startRef.current;
      const remaining = Math.max(0, MIN_SHOW - elapsed);
      timerRef.current = setTimeout(() => {
        bar.style.transform = "translateX(0%) scaleX(0.01)";
        bar.style.opacity = "0";
        timerRef.current = setTimeout(() => {
          bar.style.transition = "none";
          bar.style.transform = "translateX(-100%)";
          bar.style.opacity = "0";
        }, 300);
      }, remaining);
    }
  }, []);

  useEffect(() => {
    if (state === "navigating") {
      animate("start");
    } else {
      animate("finish");
    }
  }, [state, animate]);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  if (!mounted) return null;

  return ReactDOM.createPortal(
    <div
      ref={barRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "3px",
        zIndex: 9999,
        pointerEvents: "none",
        transform: "translateX(-100%)",
        opacity: 0,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(90deg, hsl(var(--accent)), hsl(var(--accent) / 0.6))",
          boxShadow: "0 0 8px hsl(var(--accent) / 0.5)",
        }}
      />
    </div>,
    document.body,
  );
}

