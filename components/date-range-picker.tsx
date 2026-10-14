"use client";

import { useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  CALENDAR_END_MONTH,
  CALENDAR_START_MONTH,
  DATE_PRESETS,
  describeRange,
  presetRange,
  type DatePresetId,
} from "@/lib/date-presets";

/** A range is either a rolling preset or explicit days (both ends local midnight from the calendar). */
export interface DateRangeValue {
  preset?: DatePresetId;
  from?: Date;
  to?: Date;
}

export interface DateRangePresetsProps {
  value: DateRangeValue;
  /** Method signature suppresses the Next TS plugin's false-positive serialization warning. */
  onChange(next: DateRangeValue): void;
  /** Section label above the calendar, e.g. "Last Contact". */
  label?: string;
  /** Months shown side by side on md+ (one on phones). */
  numberOfMonths?: number;
  /** What an empty range means here, e.g. "All time" or "Any date". */
  emptyLabel?: string;
}

/**
 * Shortcuts + range calendar, the body of a date-range popover (shadcn's
 * "date picker with presets" pattern). Picking a shortcut stores its id so the
 * range stays rolling; picking days on the calendar stores those days.
 */
export function DateRangePresets({ value, onChange, label, numberOfMonths = 1, emptyLabel = "Any date" }: DateRangePresetsProps) {
  const isMobile = useIsMobile();
  const hasRange = !!(value.preset || value.from || value.to);
  // While a preset is active, show its days on the calendar.
  const shown = value.preset ? presetDays(value.preset) : { from: value.from, to: value.to };

  return (
    <div className="grid w-fit p-2">
      <div className="flex w-full items-center justify-between gap-2 px-1 pb-2">
        <span className="min-w-0 text-xs font-medium text-muted-foreground">
          {label ? `${label}: ` : ""}
          <span className="text-foreground">{describeRange(value, emptyLabel)}</span>
        </span>
        {hasRange && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onChange({})}>
            Clear
          </Button>
        )}
      </div>
      <div className="flex w-fit flex-col gap-2 md:flex-row">
        <div role="group" aria-label={label ? `${label} shortcuts` : "Date shortcuts"} className="grid grid-cols-2 gap-1 md:flex md:w-32 md:flex-col">
          {DATE_PRESETS.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={value.preset === p.id ? "secondary" : "ghost"}
              aria-pressed={value.preset === p.id}
              className="h-7 justify-start px-2 text-xs font-normal"
              onClick={() => onChange({ preset: p.id })}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <Calendar
          mode="range"
          selected={shown.from || shown.to ? { from: shown.from, to: shown.to } : undefined}
          onSelect={(r) => onChange({ from: r?.from, to: r?.to })}
          defaultMonth={shown.from ?? undefined}
          numberOfMonths={isMobile ? 1 : numberOfMonths}
          captionLayout="dropdown"
          startMonth={CALENDAR_START_MONTH}
          endMonth={CALENDAR_END_MONTH}
          className="p-0"
        />
      </div>
    </div>
  );
}

// Calendar highlighting only: the preset's days, local midnight.
function presetDays(id: DatePresetId) {
  const { from, to } = presetRange(id);
  return { from, to: new Date(to.getFullYear(), to.getMonth(), to.getDate()) };
}

interface DateRangePickerProps extends Omit<DateRangePresetsProps, "label"> {
  className?: string;
  /** Accessible name prefix, e.g. "Date range". */
  ariaLabel?: string;
}

/** One button showing the range ("Last 30 days", "May 1 – May 31, 2026", "All time") that opens the presets popover. */
export function DateRangePicker({ value, onChange, className, emptyLabel = "All time", numberOfMonths = 2, ariaLabel = "Date range" }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const hasRange = !!(value.preset || value.from || value.to);
  const text = describeRange(value, emptyLabel);
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="justify-start gap-2 font-normal" aria-label={`${ariaLabel}: ${text}`}>
            <CalendarDays className="size-4" />
            <span>{text}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto max-w-[calc(100vw-1rem)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-0" align="end" collisionPadding={8}>
          <DateRangePresets
            value={value}
            emptyLabel={emptyLabel}
            numberOfMonths={numberOfMonths}
            onChange={(next) => {
              onChange(next);
              // A shortcut or a finished range is a complete choice; a first click
              // on the calendar (from only) keeps the popover open for the end day.
              if (next.preset || (next.from && next.to) || (!next.from && !next.to)) setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {hasRange && (
        <Button variant="ghost" size="icon" className="size-8" aria-label="Clear date range" onClick={() => onChange({})}>
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
