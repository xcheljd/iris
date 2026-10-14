"use client";

import { useState } from "react";
import { Check, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { DateRangePresets, type DateRangeValue } from "@/components/date-range-picker";
import type { DatePresetId } from "@/lib/date-presets";
import { cn } from "@/lib/utils";
import { endOfDay } from "date-fns";

/* -------------------------------------------------------------------------- */
/* Text filter menu — used inside a ColumnFilterPopover                        */
/* -------------------------------------------------------------------------- */

export function TextFilterMenu({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange(v: string): void;
  placeholder: string;
}) {
  const [local, setLocal] = useState(value);
  return (
    <form
      className="p-2"
      onSubmit={(e) => {
        e.preventDefault();
        onChange(local.trim());
      }}
    >
      <Input
        autoFocus
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="h-8"
      />
      <div className="flex gap-2 mt-2">
        <Button type="submit" size="sm" className="flex-1 h-7 text-xs">Apply</Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            setLocal("");
            onChange("");
          }}
        >
          Clear
        </Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Single-select menu — used inside a ColumnFilterPopover                      */
/* -------------------------------------------------------------------------- */

export interface SingleSelectOption {
  value: string;
  label: string;
}

export function SingleSelectMenu({
  options,
  value,
  onChange,
  searchable = false,
}: {
  options: SingleSelectOption[];
  value: string;
  onChange(v: string): void;
  searchable?: boolean;
}) {
  return (
    <Command>
      {searchable && <CommandInput placeholder="Search…" />}
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup>
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <CommandItem
                key={opt.value}
                value={opt.label}
                onSelect={() => onChange(opt.value)}
                className="flex items-center gap-2"
              >
                <Check className={cn("size-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                <span className="flex-1 truncate">{opt.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/* -------------------------------------------------------------------------- */
/* Generic multi-select menu — used inside a ColumnFilterPopover               */
/* -------------------------------------------------------------------------- */

export function MultiSelectMenu({
  options,
  selected,
  onChange,
  placeholder = "Search…",
}: {
  options: SingleSelectOption[];
  selected: string[];
  onChange(next: string[]): void;
  placeholder?: string;
}) {
  const toggle = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    onChange(next);
  };

  return (
    <Command>
      <CommandInput placeholder={placeholder} />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup>
          {options.map((opt) => {
            const isSelected = selected.includes(opt.value);
            return (
              <CommandItem
                key={opt.value}
                value={opt.label}
                onSelect={() => toggle(opt.value)}
                className="flex items-center gap-2"
              >
                <div
                  className={cn(
                    "flex size-4 items-center justify-center rounded border",
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/30",
                  )}
                >
                  {isSelected && <Check className="size-3" />}
                </div>
                <span className="flex-1 truncate">{opt.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/* -------------------------------------------------------------------------- */
/* Numeric range menu (dual-handle slider + editable bounds)                   */
/* -------------------------------------------------------------------------- */

/** Click-to-edit currency label that drives one end of the range. */
function BoundField({
  value,
  onCommit,
  align,
  plus = false,
}: {
  value: number;
  onCommit(n: number): void;
  align: "left" | "right";
  plus?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (editing) {
    return (
      <input
        type="number"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = parseFloat(draft);
          onCommit(isNaN(n) ? value : n);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className={cn(
          "h-7 w-20 rounded border bg-background px-2 text-sm tabular-nums",
          align === "right" && "text-right",
        )}
      />
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "h-7 rounded px-1 text-sm tabular-nums hover:bg-muted",
        align === "right" && "text-muted-foreground",
      )}
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
    >
      ${value.toLocaleString()}
      {plus ? "+" : ""}
    </button>
  );
}

/**
 * Dual-handle range filter. `ceiling` is the upper bound (e.g. the global
 * max). A min of 0 / max at ceiling means "unfiltered" — the caller decides
 * how to translate that to URL params. Commits on slider release or when an
 * edited bound is confirmed (not on every drag tick).
 */
export function RangeFilterMenu({
  min,
  max,
  ceiling,
  onChange,
}: {
  min: number;
  max: number;
  ceiling: number;
  onChange(next: { min: number; max: number }): void;
}) {
  // A local draft while dragging/editing, tied to the bounds it was taken
  // against — new props discard it without remounting (a key would steal
  // focus from the BoundField being typed in).
  const bounds = `${min}-${max}`;
  const [draft, setDraft] = useState<{ bounds: string; range: [number, number] } | null>(null);
  const range: [number, number] = draft?.bounds === bounds ? draft.range : [min, max];
  const setRange = (next: [number, number]) => setDraft({ bounds, range: next });

  const [lo, hi] = range;
  const step = Math.max(1, Math.round(ceiling / 200));

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center justify-between">
        <BoundField
          value={lo}
          align="left"
          onCommit={(n) => {
            const clamped = Math.min(Math.max(0, n), hi);
            setRange([clamped, hi]);
            onChange({ min: clamped, max: hi });
          }}
        />
        <BoundField
          value={hi}
          align="right"
          plus={hi >= ceiling}
          onCommit={(n) => {
            const clamped = Math.max(Math.min(ceiling, n), lo);
            setRange([lo, clamped]);
            onChange({ min: lo, max: clamped });
          }}
        />
      </div>
      <Slider
        min={0}
        max={ceiling}
        step={step}
        value={range}
        onValueChange={(v) => setRange([v[0], v[1]] as [number, number])}
        onValueCommit={(v) => onChange({ min: v[0], max: v[1] })}
        disabled={ceiling <= 0}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tag multi-select menu — used inside a ColumnFilterPopover                   */
/* -------------------------------------------------------------------------- */

interface TagOption {
  name: string;
  usageCount: number;
}

export function TagsFilterMenu({
  allTags,
  selected,
  mode,
  onChange,
}: {
  allTags: TagOption[];
  selected: string[];
  mode: "any" | "all";
  onChange(next: { selected: string[]; mode: "any" | "all" }): void;
}) {
  const toggleTag = (name: string) => {
    const next = selected.includes(name)
      ? selected.filter((t) => t !== name)
      : [...selected, name];
    onChange({ selected: next, mode });
  };
  const setMode = (m: "any" | "all") => onChange({ selected, mode: m });

  return (
    <>
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
        <span className="text-muted-foreground">Match</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode("any")}
            aria-pressed={mode === "any"}
            className={cn(
              "rounded px-2 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
              mode === "any" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            Any
          </button>
          <button
            type="button"
            onClick={() => setMode("all")}
            aria-pressed={mode === "all"}
            className={cn(
              "rounded px-2 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
              mode === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            All
          </button>
        </div>
      </div>
      <Command>
        <CommandInput placeholder="Search tags…" />
        <CommandList>
          <CommandEmpty>No tags found.</CommandEmpty>
          <CommandGroup>
            {allTags.map((tag) => {
              const isSelected = selected.includes(tag.name);
              return (
                <CommandItem
                  key={tag.name}
                  value={tag.name}
                  onSelect={() => toggleTag(tag.name)}
                  className="flex items-center gap-2"
                >
                  <div
                    className={cn(
                      "flex size-4 items-center justify-center rounded border",
                      isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30",
                    )}
                  >
                    {isSelected && <Check className="size-3" />}
                  </div>
                  <span className="flex-1 truncate">{tag.name}</span>
                  {tag.usageCount > 0 && (
                    <Badge variant="secondary" className="text-xs tracking-wide">{tag.usageCount}</Badge>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Dates button — sits in the top row, opens a popover with two date ranges    */
/* -------------------------------------------------------------------------- */

type DateField = "lastContact" | "created";

/** The URL/filter keys a date field writes, e.g. lastContactFrom / lastContactTo / lastContactRange. */
export type DateFieldChange = Partial<Record<`${DateField}${"From" | "To"}`, number | undefined> & Record<`${DateField}Range`, DatePresetId | undefined>>;

interface DateFilterButtonProps {
  field: DateField;
  /** Button text, e.g. "Last contact". Stays the same when a range is set; the button shades and the filter chip shows the range. */
  label: string;
  from?: number;
  to?: number;
  range?: DatePresetId;
  onChange(next: DateFieldChange): void;
  className?: string;
}

const toTs = (d?: Date) => (d ? Math.floor(d.getTime() / 1000) : undefined);
// The picker yields local midnight, and the query bound is inclusive (`lte`), so a
// midnight "to" would drop the whole last day. The columns hold whole seconds.
const toEndTs = (d?: Date) => (d ? toTs(endOfDay(d)) : undefined);

/**
 * One date filter (Last contact or Created): shortcuts + a range calendar. Each
 * field has its own button so a phone shows one calendar at a time. A shortcut
 * is stored by id (rolling); picked days as unix seconds.
 */
export function DateFilterButton({ field, label, from, to, range, onChange, className }: DateFilterButtonProps) {
  const [open, setOpen] = useState(false);
  const isSet = !!(from || to || range);
  const value: DateRangeValue = range
    ? { preset: range }
    : { from: from ? new Date(from * 1000) : undefined, to: to ? new Date(to * 1000) : undefined };

  const emit = (v: DateRangeValue) =>
    onChange({
      [`${field}From`]: v.preset ? undefined : toTs(v.from),
      [`${field}To`]: v.preset ? undefined : toEndTs(v.to),
      [`${field}Range`]: v.preset,
    } as DateFieldChange);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={isSet ? "secondary" : "outline"}
          size="sm"
          className={cn("h-9 gap-2 font-normal", isSet && "border border-transparent", className)}
          aria-label={isSet ? `${label} (filtered)` : label}
        >
          <CalendarDays className="size-4" />
          <span>{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto max-w-[calc(100vw-1rem)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-0"
        align="start"
        collisionPadding={8}
      >
        <DateRangePresets
          label={label}
          value={value}
          onChange={(v) => {
            emit(v);
            // A shortcut, a finished range or a clear is a complete choice; the
            // first calendar click (start day only) keeps it open for the end day.
            if (v.preset || (v.from && v.to) || (!v.from && !v.to)) setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
