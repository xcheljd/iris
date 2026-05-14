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

  const removeOne = (entry: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeFromSearchHistory(historyKey, entry);
    reload();
  };

  const visible = filteredHistory.slice(0, maxEntries);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
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
          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 rounded-md border bg-popover shadow-md">
          <div className="px-2 py-1.5 text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Recent searches
          </div>
          <div className="border-t" />
          <ul role="listbox" className="py-1 max-h-64 overflow-auto">
            {visible.map((entry) => (
              <li key={entry}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center justify-between gap-2 group"
                  onMouseDown={(e) => e.preventDefault()} // keep input focus
                  onClick={() => applyHistory(entry)}
                >
                  <span className="truncate">{entry}</span>
                  <span
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded"
                    onClick={(e) => removeOne(entry, e)}
                    aria-label={`Remove "${entry}" from history`}
                  >
                    <X className="h-3 w-3" />
                  </span>
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
