"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

type NavigationState = "idle" | "navigating";

interface NavigationTransitionContextValue {
  state: NavigationState;
  targetPath: string | null;
  targetTitle: string | null;
}

const NavigationTransitionContext = createContext<NavigationTransitionContextValue>({
  state: "idle",
  targetPath: null,
  targetTitle: null,
});

export function useNavigationTransition() {
  return useContext(NavigationTransitionContext);
}

const TITLE_MAP: Record<string, string> = {
  "/": "Dashboard",
  "/clients": "Clients",
  "/clients/new": "Add New Client",
  "/follow-ups": "Follow-Ups",
  "/smart-lists": "Smart Lists",
  "/promos": "Promo Manager",
  "/analytics": "Analytics",
  "/analytics/collections": "Collections",
  "/banned": "Banned Customers",
  "/unsubscribed": "Unsubscribed",
  "/approvals": "Approvals",
  "/settings": "Settings",
  "/prospects": "Prospects",
  "/catalog": "Model Catalog",
  "/change-password": "Change Password",
};

const NAVIGATION_FAILSAFE_MS = 10_000;

function titleForPath(href: string): string {
  const path = href.replace(/\/+$/, "") || "/";
  if (TITLE_MAP[path]) return TITLE_MAP[path];
  if (path.startsWith("/clients/") && path.endsWith("/edit")) return "Edit Client";
  if (path.startsWith("/clients/")) return "Client";
  if (path.startsWith("/prospects/")) return "Prospect";
  return "";
}

export function NavigationTransitionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<NavigationState>("idle");
  const [targetPath, setTargetPath] = useState<string | null>(null);
  const [targetTitle, setTargetTitle] = useState<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    setState("idle");
    setTargetPath(null);
    setTargetTitle(null);
  }, [pathname]);

  // Failsafe: a navigation that never changes the pathname (e.g. a redirect back
  // to the same path) would otherwise leave the overlay up forever.
  useEffect(() => {
    if (state !== "navigating") return;
    const timer = setTimeout(() => {
      setState("idle");
      setTargetPath(null);
      setTargetTitle(null);
    }, NAVIGATION_FAILSAFE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      )
        return;
      if (anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      // blob:/data: — a blob:'s origin equals the page's, so origin-checking alone is insufficient
      if (!url.protocol.startsWith("http")) return;
      if (url.origin !== window.location.origin) return;
      // usePathname() carries no query string, so a same-path ?query link never resets
      if (url.pathname === pathname) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      setState("navigating");
      setTargetPath(href);
      setTargetTitle(titleForPath(href));
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [pathname]);

  return (
    <NavigationTransitionContext.Provider value={{ state, targetPath, targetTitle }}>
      {children}
    </NavigationTransitionContext.Provider>
  );
}
