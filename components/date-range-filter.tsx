"use client";

import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";

export interface DateRange {
  from?: Date;
  to?: Date;
}

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Section label shown above the calendar, e.g. "Last Contact". */
  label?: string;
}

/**
 * Inline date range picker — Calendar with `mode="range"` plus a small label
 * and Clear button. Designed to be mounted inside a popover (e.g. the global
 * "Dates" button or a ColumnFilterPopover).
 */
export function DateRangeFilter({ value, onChange, label }: DateRangeFilterProps) {
  const hasRange = !!(value.from || value.to);

  return (
    <div className="p-2">
      {label && (
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          {hasRange && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => onChange({ from: undefined, to: undefined })}
            >
              Clear
            </Button>
          )}
        </div>
      )}
      <Calendar
        mode="range"
        selected={hasRange ? { from: value.from, to: value.to } : undefined}
        onSelect={(range) => onChange({ from: range?.from, to: range?.to })}
        numberOfMonths={1}
      />
      {hasRange && (
        <div className="px-1 pt-1 text-xs text-muted-foreground">
          {value.from ? format(value.from, "MMM d, yyyy") : "—"}
          {" → "}
          {value.to ? format(value.to, "MMM d, yyyy") : "—"}
        </div>
      )}
    </div>
  );
}
