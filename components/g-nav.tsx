"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type GNavEntry = { key: string; href: string; label: string; managerOnly?: boolean };

// Any open interactive surface that should swallow the chord. Covers Radix
// Dialog / Menu / Select (combobox+listbox) / AlertDialog, plus non-Radix
// modals that set aria-modal (the onboarding tour). listbox is bare because
// in this codebase listboxes are only mounted while open.
const OPEN_SURFACE_SELECTOR =
  '[role="dialog"][data-state="open"], ' +
  '[role="alertdialog"][data-state="open"], ' +
  '[role="menu"][data-state="open"], ' +
  '[role="combobox"][data-state="open"], ' +
  '[role="listbox"], ' +
  '[aria-modal="true"]';

// "g" itself repeats for GitHub-style `g g`; "d" is the mnemonic alias.
const ENTRIES: GNavEntry[] = [
  { key: "g", href: "/", label: "Dashboard" },
  { key: "d", href: "/", label: "Dashboard" },
  { key: "c", href: "/clients", label: "Clients" },
  { key: "p", href: "/prospects", label: "Prospects" },
  { key: "f", href: "/follow-ups", label: "Follow-Ups" },
  { key: "l", href: "/smart-lists", label: "Smart Lists" },
  { key: "t", href: "/promos", label: "Promos" },
  { key: "m", href: "/catalog", label: "Catalog", managerOnly: true },
  { key: "a", href: "/analytics", label: "Analytics" },
  { key: "w", href: "/analytics/collections", label: "Collections" },
  { key: "b", href: "/banned", label: "Banned" },
  { key: "u", href: "/unsubscribed", label: "Unsubscribed" },
  { key: "r", href: "/approvals", label: "Approvals", managerOnly: true },
  { key: "s", href: "/settings", label: "Settings" },
];

export function GNav() {
  const router = useRouter();
  const { data: session } = useSession();
  const isManager = session?.user?.role === "manager";
  const [armed, setArmed] = React.useState(false);
  const timeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const disarm = () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setArmed(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Any modifier (or auto-repeat) means this isn't a clean chord press.
      // Modifier presses also disarm an in-flight chord (e.g. Cmd+K opens the
      // palette mid-chord — reset so it can't fire after the palette closes).
      if (e.metaKey || e.ctrlKey || e.altKey) {
        disarm();
        return;
      }
      if (e.repeat) return;
      const target = e.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector(OPEN_SURFACE_SELECTOR)) return;

      // Normalize so Shift+G arms and Shift+C navigates instead of canceling.
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (!armed) {
        if (k === "g") {
          setArmed(true);
          timeoutRef.current = window.setTimeout(() => setArmed(false), 2000);
        }
        return;
      }

      if (k === "Escape") {
        disarm();
        return;
      }
      // Non-printable (arrows, space, etc.) leaves the chord armed.
      if (k.length !== 1) return;
      disarm();
      const entry = ENTRIES.find((en) => en.key === k && (!en.managerOnly || isManager));
      if (entry) {
        e.preventDefault();
        router.push(entry.href);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [armed, isManager, router]);

  // The listener effect re-runs on every arm/disarm, so the pending disarm
  // timeout can't live in its cleanup — clear it on unmount only.
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!armed) return null;

  // One pill item per destination for this role ("d" alias folds into "g g").
  const visible = ENTRIES.filter((en) => en.key !== "d" && (!en.managerOnly || isManager));

  return (
    <div aria-hidden="true" className="pointer-events-none fixed bottom-16 left-1/2 z-50 -translate-x-1/2 max-w-[90vw] truncate rounded-full border bg-popover px-4 py-1.5 text-xs text-popover-foreground shadow-md animate-in fade-in duration-150 motion-reduce:animate-none">
      {visible.map((en, i) => (
        <span key={en.key}>
          {i > 0 && <span className="text-muted-foreground"> · </span>}
          <span className="font-bold">g {en.key === "g" ? "g" : en.key}</span> {en.label}
        </span>
      ))}
    </div>
  );
}
