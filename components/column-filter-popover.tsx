"use client";

import { useState, type ReactNode } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ColumnFilterPopoverProps {
  /** True when this column has an active filter — visually fills the funnel. */
  active: boolean;
  /** Called when the user hits the Clear button at the bottom of the popover. */
  onClear?(): void;
  /** ARIA label for the trigger button (screen readers). */
  label: string;
  /** Popover content — the column-specific filter UI. */
  children: ReactNode;
  /** Tailwind width class for the popover, e.g. "w-72". */
  contentWidth?: string;
  /** Optional alignment for the popover. */
  align?: "start" | "center" | "end";
}

/**
 * Funnel-icon filter trigger for column headers. Filled with primary when
 * `active=true` to indicate the column has an active filter. Wraps a popover
 * whose contents the caller provides (text input, select, date range, etc.).
 */
export function ColumnFilterPopover({
  active,
  onClear,
  label,
  children,
  contentWidth = "w-72",
  align = "start",
}: ColumnFilterPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          aria-label={`Filter ${label}`}
          aria-pressed={active}
        >
          <Filter
            className={cn(
              "h-3.5 w-3.5 transition-colors",
              active ? "fill-primary text-primary" : "text-muted-foreground/60",
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn(contentWidth, "p-0")} align={align}>
        {children}
        {active && onClear && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center text-xs"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
            >
              Clear filter
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
