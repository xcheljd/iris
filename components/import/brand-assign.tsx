"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBrands } from "@/components/brands-provider";
import type { BrandSuggestion } from "@/lib/brand-suggest";

/**
 * Per-row brand assignment for imported rows the catalog has no brand for —
 * shared by the promo and catalog imports. Each row starts on its suggested
 * brand (if any); the manager can change any row, or tick rows and set one
 * brand for all of them.
 */

export interface BrandAssignRow {
  key: string;
  /** False for rows whose brand comes from the catalog (nothing to pick). */
  needsBrand: boolean;
  suggestion: BrandSuggestion;
}

export interface BrandChoice {
  brand: string | null;
  /** True while the brand is the untouched suggestion. */
  suggested: boolean;
}

export type BrandFilter = "all" | "needs" | "suggested" | "conflicts";

const NONE = "__none";

export function useBrandAssignment(rows: readonly BrandAssignRow[]) {
  const [edits, setEdits] = useState<Record<string, BrandChoice>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<BrandFilter>("all");
  const [saveToCatalog, setSaveToCatalog] = useState(true);

  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  const choice = useCallback((key: string): BrandChoice => {
    if (edits[key]) return edits[key];
    const s = byKey.get(key)?.suggestion;
    return s?.brand ? { brand: s.brand, suggested: true } : { brand: null, suggested: false };
  }, [edits, byKey]);

  const setBrand = (key: string, brand: string | null) => setEdits((e) => ({ ...e, [key]: { brand, suggested: false } }));
  const setBrandFor = (keys: Iterable<string>, brand: string) =>
    setEdits((e) => { const next = { ...e }; for (const k of keys) next[k] = { brand, suggested: false }; return next; });

  const needing = useMemo(() => rows.filter((r) => r.needsBrand), [rows]);
  const kind = useCallback((r: BrandAssignRow): Exclude<BrandFilter, "all"> | null => {
    if (!r.needsBrand) return null;
    const c = choice(r.key);
    if (r.suggestion.conflict.length > 0 && !c.brand) return "conflicts";
    if (c.suggested) return "suggested";
    if (!c.brand) return "needs";
    return null;
  }, [choice]);
  const counts = useMemo(() => {
    const out = { needs: 0, suggested: 0, conflicts: 0 };
    for (const r of needing) { const k = kind(r); if (k) out[k]++; }
    return out;
  }, [needing, kind]);
  const visible = useCallback((key: string) => {
    if (filter === "all") return true;
    const r = byKey.get(key);
    return !!r && kind(r) === filter;
  }, [filter, byKey, kind]);

  const toggle = (key: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(key); else n.delete(key); return n; });
  const selectAllVisible = (on: boolean) =>
    setSelected(on ? new Set(needing.filter((r) => visible(r.key)).map((r) => r.key)) : new Set());

  const reset = () => { setEdits({}); setSelected(new Set()); setFilter("all"); setSaveToCatalog(true); };

  return {
    choice, setBrand, setBrandFor, selected, toggle, selectAllVisible, filter, setFilter, counts,
    visible, needing, saveToCatalog, setSaveToCatalog, reset,
  };
}

export type BrandAssignment = ReturnType<typeof useBrandAssignment>;

/** The brand cell of a row that needs one: a picker plus why the brand was suggested. */
export function BrandPicker({ rowKey, assign, suggestion, label }: { rowKey: string; assign: BrandAssignment; suggestion: BrandSuggestion; label: string }) {
  const brands = useBrands();
  const c = assign.choice(rowKey);
  return (
    <div className="flex flex-col gap-1 min-w-36">
      <Select value={c.brand ?? NONE} onValueChange={(v) => assign.setBrand(rowKey, v === NONE ? null : v)}>
        <SelectTrigger className={`h-8 text-xs ${c.brand ? "" : "text-warning"}`} aria-label={`Brand for ${label}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Needs brand</SelectItem>
          {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
        </SelectContent>
      </Select>
      {c.suggested && suggestion.reason && (
        <span className="flex items-start gap-1 text-xs text-muted-foreground"><Sparkles className="size-3 mt-0.5 shrink-0" />Suggested — {suggestion.reason}</span>
      )}
      {!c.brand && suggestion.reason && (
        <span className="flex items-start gap-1 text-xs text-warning"><AlertTriangle className="size-3 mt-0.5 shrink-0" />{suggestion.reason}</span>
      )}
    </div>
  );
}

/** Row checkbox for bulk brand setting (rendered only on rows that need a brand). */
export function BrandRowCheckbox({ rowKey, assign, label }: { rowKey: string; assign: BrandAssignment; label: string }) {
  return (
    <Checkbox
      checked={assign.selected.has(rowKey)}
      onCheckedChange={(v) => assign.toggle(rowKey, v === true)}
      aria-label={`Select ${label}`}
    />
  );
}

/** Filter chips, the "set brand for selected" control and the save-to-catalog switch. */
export function BrandAssignBar({ assign, noun = "rows", showSave = true }: {
  assign: BrandAssignment;
  noun?: string;
  /** The catalog import always writes the catalog, so it hides the switch. */
  showSave?: boolean;
}) {
  const brands = useBrands();
  const [bulk, setBulk] = useState("");
  if (assign.needing.length === 0) return null;
  const chips: { key: BrandFilter; label: string; n?: number }[] = [
    { key: "all", label: "All" },
    { key: "needs", label: "Needs brand", n: assign.counts.needs },
    { key: "suggested", label: "Suggested", n: assign.counts.suggested },
    { key: "conflicts", label: "Conflicts", n: assign.counts.conflicts },
  ];
  const visibleNeeding = assign.needing.filter((r) => assign.visible(r.key));
  const allTicked = visibleNeeding.length > 0 && visibleNeeding.every((r) => assign.selected.has(r.key));
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 bg-muted/30" data-testid="brand-assign-bar">
      <div className="text-sm font-medium">Brands</div>
      <p className="text-xs text-muted-foreground">
        {assign.needing.length} {assign.needing.length === 1 ? "model has" : "models have"} no brand yet.
        Suggested brands are filled in; change any row, or tick rows and set a brand for all of them.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((c) => (
          <Button
            key={c.key}
            type="button"
            size="sm"
            variant={assign.filter === c.key ? "secondary" : "ghost"}
            className="h-7 text-xs"
            aria-pressed={assign.filter === c.key}
            onClick={() => assign.setFilter(c.key)}
          >
            {c.label}{c.n != null && ` (${c.n})`}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs">
          <Checkbox checked={allTicked} onCheckedChange={(v) => assign.selectAllVisible(v === true)} aria-label="Select all shown" />
          Select all shown
        </label>
        <span className="text-xs text-muted-foreground">{assign.selected.size} selected</span>
        <Select value={bulk || undefined} onValueChange={setBulk}>
          <SelectTrigger className="h-8 w-44 text-xs" aria-label="Brand for selected rows"><SelectValue placeholder="Pick a brand" /></SelectTrigger>
          <SelectContent>{brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          disabled={!bulk || assign.selected.size === 0}
          onClick={() => { assign.setBrandFor(assign.selected, bulk); assign.selectAllVisible(false); }}
        >
          Set brand for {assign.selected.size} {assign.selected.size === 1 ? noun.replace(/s$/, "") : noun}
        </Button>
      </div>
      {showSave ? (
      <label className="flex items-center gap-2 text-xs">
        <Checkbox checked={assign.saveToCatalog} onCheckedChange={(v) => assign.setSaveToCatalog(v === true)} aria-label="Save brands to the catalog" />
        Save brands to the catalog, so these models don&apos;t need a brand next time
        <span className="text-muted-foreground">(kept suggestions are marked for review)</span>
      </label>
      ) : (
        <p className="text-xs text-muted-foreground">Suggestions you keep without changing are marked for review in the catalog.</p>
      )}
    </div>
  );
}
