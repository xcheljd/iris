"use client";

import { useEffect, useState } from "react";
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
import { DateRangeFilter, type DateRange } from "@/components/date-range-filter";
import { cn } from "@/lib/utils";

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
                <Check className={cn("h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
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
                    "flex h-4 w-4 items-center justify-center rounded border",
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/30",
                  )}
                >
                  {isSelected && <Check className="h-3 w-3" />}
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
  const [range, setRange] = useState<[number, number]>([min, max]);

  useEffect(() => {
    setRange([min, max]);
  }, [min, max]);

  const [lo, hi] = range;
  const step = Math.max(1, Math.round(ceiling / 200));

  return (
    <div className="space-y-4 p-3">
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
            className={cn(
              "rounded px-2 py-0.5 transition-colors",
              mode === "any" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            Any
          </button>
          <button
            type="button"
            onClick={() => setMode("all")}
            className={cn(
              "rounded px-2 py-0.5 transition-colors",
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
                      "flex h-4 w-4 items-center justify-center rounded border",
                      isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30",
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                  <span className="flex-1 truncate">{tag.name}</span>
                  {tag.usageCount > 0 && (
                    <Badge variant="secondary" className="text-[10px]">{tag.usageCount}</Badge>
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

interface DatesFilterButtonProps {
  lastContactFrom?: number;
  lastContactTo?: number;
  createdFrom?: number;
  createdTo?: number;
  onChange(next: {
    lastContactFrom?: number;
    lastContactTo?: number;
    createdFrom?: number;
    createdTo?: number;
  }): void;
}

export function DatesFilterButton({
  lastContactFrom,
  lastContactTo,
  createdFrom,
  createdTo,
  onChange,
}: DatesFilterButtonProps) {
  const [open, setOpen] = useState(false);

  const activeCount =
    (lastContactFrom || lastContactTo ? 1 : 0) +
    (createdFrom || createdTo ? 1 : 0);

  const lastContactRange: DateRange = {
    from: lastContactFrom ? new Date(lastContactFrom * 1000) : undefined,
    to: lastContactTo ? new Date(lastContactTo * 1000) : undefined,
  };
  const createdRange: DateRange = {
    from: createdFrom ? new Date(createdFrom * 1000) : undefined,
    to: createdTo ? new Date(createdTo * 1000) : undefined,
  };

  const toTs = (d?: Date) => (d ? Math.floor(d.getTime() / 1000) : undefined);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2 font-normal">
          <CalendarDays className="h-4 w-4" />
          <span>Dates</span>
          {activeCount > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{activeCount}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <DateRangeFilter
          label="Last Contact"
          value={lastContactRange}
          onChange={(r) => onChange({
            lastContactFrom: toTs(r.from),
            lastContactTo: toTs(r.to),
            createdFrom,
            createdTo,
          })}
        />
        <div className="border-t" />
        <DateRangeFilter
          label="Created"
          value={createdRange}
          onChange={(r) => onChange({
            lastContactFrom,
            lastContactTo,
            createdFrom: toTs(r.from),
            createdTo: toTs(r.to),
          })}
        />
        {activeCount > 0 && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center text-xs"
              onClick={() => {
                onChange({
                  lastContactFrom: undefined,
                  lastContactTo: undefined,
                  createdFrom: undefined,
                  createdTo: undefined,
                });
                setOpen(false);
              }}
            >
              Clear all dates
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
