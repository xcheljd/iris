"use client";

import { useState } from "react";
import { Copy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SKIP_PICK } from "@/lib/import-grid";

/**
 * "This model is on more than one row — pick one." Shared by the promo and
 * catalog imports. Every copy is shown side by side; values every copy
 * agrees on are dimmed so the differences stand out. The manager picks per
 * group, or ticks groups (or none = all) and applies a shortcut. The import
 * stays blocked until every group has a pick.
 */

export const SKIP = SKIP_PICK;

export interface DupCopy {
  id: string;
  /** "30% sheet · row 3", "Row 7" or "In Iris now". */
  title: string;
  fields: { label: string; value: string }[];
}

export interface DupGroup {
  key: string;
  /** The model number. */
  label: string;
  copies: DupCopy[];
  /** Offer "Skip — import neither". */
  canSkip: boolean;
}

export interface DupShortcut {
  id: string;
  label: string;
  /** The copy this shortcut picks in a group, or null when it doesn't apply there. */
  pick: (g: DupGroup) => string | null;
}

export type DupPicks = Record<string, string>;

/** Groups still waiting for a pick (a pick that no longer exists counts as none). */
export function unpicked(groups: readonly DupGroup[], picks: DupPicks): DupGroup[] {
  return groups.filter((g) => {
    const p = picks[g.key];
    return !p || (p === SKIP ? !g.canSkip : !g.copies.some((c) => c.id === p));
  });
}

export function DuplicatePicker({ groups, picks, onChange, shortcuts, noun = "model" }: {
  groups: readonly DupGroup[];
  picks: DupPicks;
  onChange: (next: DupPicks) => void;
  shortcuts: readonly DupShortcut[];
  noun?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shortcut, setShortcut] = useState(shortcuts[0]?.id ?? "");
  if (groups.length === 0) return null;
  const left = unpicked(groups, picks).length;

  const apply = () => {
    const sc = shortcuts.find((s) => s.id === shortcut);
    if (!sc) return;
    const targets = selected.size > 0 ? groups.filter((g) => selected.has(g.key)) : groups;
    const next = { ...picks };
    let done = 0;
    for (const g of targets) {
      const id = sc.pick(g);
      if (id) { next[g.key] = id; done++; }
    }
    onChange(next);
    setSelected(new Set());
    const missed = targets.length - done;
    toast.success(`Applied to ${done} ${done === 1 ? noun : `${noun}s`}` + (missed > 0 ? ` · ${missed} didn't fit "${sc.label}" — pick those yourself` : ""));
  };

  const allTicked = selected.size === groups.length;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning/5 p-3" data-testid="duplicate-picker">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Copy className="size-4" />
          Duplicates ({groups.length})
        </div>
        {left > 0 ? (
          <span className="flex items-center gap-1 text-xs text-warning"><AlertTriangle className="size-3.5" />{left} left to pick — import is blocked until all are picked</span>
        ) : (
          <span className="text-xs text-success">All picked</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        These {noun}s appear more than once. Pick the copy to use for each. Values every copy agrees on are dimmed.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={allTicked}
            onCheckedChange={(v) => setSelected(v === true ? new Set(groups.map((g) => g.key)) : new Set())}
            aria-label="Select all duplicates"
          />
          Select all
        </label>
        <span className="text-xs text-muted-foreground">{selected.size} selected</span>
        <Select value={shortcut} onValueChange={setShortcut}>
          <SelectTrigger className="h-8 w-56 text-xs" aria-label="Shortcut"><SelectValue /></SelectTrigger>
          <SelectContent>{shortcuts.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button type="button" size="sm" onClick={apply}>
          {selected.size > 0 ? `Apply to ${selected.size} selected` : "Apply to all"}
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {groups.map((g) => {
          const pick = picks[g.key];
          const isLeft = unpicked([g], picks).length > 0;
          // A field is dimmed when every copy shows the same value.
          const same = new Set(
            (g.copies[0]?.fields ?? []).map((f) => f.label)
              .filter((label) => new Set(g.copies.map((c) => c.fields.find((f) => f.label === label)?.value ?? "")).size === 1),
          );
          return (
            <li key={g.key} className={`flex flex-col gap-2 rounded-md border bg-background p-2 ${isLeft ? "border-warning/60" : ""}`}>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selected.has(g.key)}
                  onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); if (v === true) n.add(g.key); else n.delete(g.key); return n; })}
                  aria-label={`Select duplicate ${g.label}`}
                />
                <span className="font-mono text-sm font-medium">{g.label}</span>
                <span className="text-xs text-muted-foreground">{g.copies.length} copies</span>
              </div>
              <RadioGroup
                value={pick ?? ""}
                onValueChange={(v) => onChange({ ...picks, [g.key]: v })}
                className="flex flex-col gap-1"
                aria-label={`Copy to use for ${g.label}`}
              >
                {g.copies.map((c) => (
                  <label key={c.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded px-2 py-1 text-xs cursor-pointer ${pick === c.id ? "bg-primary/10" : "hover:bg-muted/50"}`}>
                    <RadioGroupItem value={c.id} aria-label={`${g.label}: ${c.title}`} />
                    <span className="font-medium min-w-36">{c.title}</span>
                    {c.fields.map((f) => (
                      <span key={f.label} className="flex items-baseline gap-1">
                        <span className="text-muted-foreground">{f.label}</span>
                        <span className={same.has(f.label) ? "text-muted-foreground/60" : "font-medium"}>{f.value || "—"}</span>
                      </span>
                    ))}
                  </label>
                ))}
                {g.canSkip && (
                  <label className={`flex items-center gap-3 rounded px-2 py-1 text-xs cursor-pointer ${pick === SKIP ? "bg-primary/10" : "hover:bg-muted/50"}`}>
                    <RadioGroupItem value={SKIP} aria-label={`${g.label}: skip`} />
                    <span className="font-medium">Skip — import neither</span>
                  </label>
                )}
              </RadioGroup>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
