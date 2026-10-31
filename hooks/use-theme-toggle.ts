"use client";
import { useTheme } from "next-themes";

/** Light/dark switch with a short cross-fade (used by the desktop top bar and the phone More menu). */
export function useThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return () => {
    // Smooth cross-fade: enable transitions only for the duration of the switch.
    const root = document.documentElement;
    root.classList.add("theme-transitioning");
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
    window.setTimeout(() => root.classList.remove("theme-transitioning"), 350);
  };
}
