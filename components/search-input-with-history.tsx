"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SearchInputWithHistoryProps {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  className?: string;
  /** localStorage key for the history (scopes by page). */
  historyKey: string;
  /** Max entries to keep (default 5). */
  maxEntries?: number;
}

/**
 * SearchInput with a "recent searches" dropdown that appears on focus when
 * there's history. Entries are pushed to localStorage by `pushSearchHistory`
 * — call that from the page after the debounce commits the search.
 */
export function SearchInputWithHistory({
  value,
  onChange,
  placeholder = "Search…",
  className,
  historyKey,
  maxEntries = 5,
}: SearchInputWithHistoryProps) {
  const [history, setHistory] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load history on mount and re-load whenever the dropdown opens (so updates
  // from elsewhere on the page are reflected).
  const reload = useCallback(() => {
    setHistory(readSearchHistory(historyKey));
  }, [historyKey]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { if (open) reload(); }, [open, reload]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filteredHistory = value
    ? history.filter((h) => h.toLowerCase().includes(value.toLowerCase()) && h !== value)
    : history;
  const showDropdown = open && filteredHistory.length > 0;

  const applyHistory = (entry: string) => {
    onChange(entry);
    setOpen(false);
  };

  const removeOne = (entry: string) => {
    removeFromSearchHistory(historyKey, entry);
    reload();
  };

  const clearAll = () => {
    clearSearchHistory(historyKey);
    reload();
  };

  const visible = filteredHistory.slice(0, maxEntries);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="pl-10 pr-10"
      />
      {value && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 -translate-y-1/2 size-7 p-0"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </Button>
      )}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 rounded-md border bg-popover shadow-md">
          <div className="px-2 py-1.5 text-xs text-muted-foreground flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <Clock className="size-3" />
              Recent searches
            </span>
            <button
              type="button"
              className="rounded px-1 py-0.5 hover:text-foreground hover:bg-muted"
              onMouseDown={(e) => e.preventDefault()} // keep input focus
              onClick={clearAll}
            >
              Clear all
            </button>
          </div>
          <div className="border-t" />
          <ul role="listbox" className="py-1 max-h-64 overflow-auto">
            {visible.map((entry) => (
              // The row body and the remove button are siblings, not nested —
              // a button inside a button is invalid and untabbable.
              <li key={entry} className="flex items-center gap-1 px-1 hover:bg-accent group">
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left px-2 py-1.5 text-sm truncate"
                  onMouseDown={(e) => e.preventDefault()} // keep input focus
                  onClick={() => applyHistory(entry)}
                >
                  {entry}
                </button>
                <button
                  type="button"
                  aria-label={`Remove recent search: ${entry}`}
                  className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-muted focus-visible:opacity-100 group-hover:opacity-100 [&_svg]:size-3"
                  onMouseDown={(e) => e.preventDefault()} // keep input focus
                  onClick={(e) => { e.stopPropagation(); removeOne(entry); }}
                >
                  <X />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* localStorage helpers (also used by consumers to push entries on commit)     */
/* -------------------------------------------------------------------------- */

const MAX = 10;

export function pushSearchHistory(key: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return;
  if (typeof window === "undefined") return;
  try {
    const existing = readSearchHistory(key);
    const deduped = [trimmed, ...existing.filter((v) => v !== trimmed)].slice(0, MAX);
    window.localStorage.setItem(key, JSON.stringify(deduped));
  } catch {
    // localStorage unavailable (private mode, quota) — silently ignore
  }
}

export function readSearchHistory(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return [];
  }
}

export function clearSearchHistory(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function removeFromSearchHistory(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    const existing = readSearchHistory(key);
    const next = existing.filter((v) => v !== value);
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore
  }
}
