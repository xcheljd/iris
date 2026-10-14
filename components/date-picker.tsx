"use client";

import { useState } from "react";
import type { Matcher } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { CALENDAR_END_MONTH, CALENDAR_START_MONTH } from "@/lib/date-presets";

interface DatePickerProps {
  date?: Date;
  onSelectAction: (date?: Date) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Days that can't be picked, e.g. `{ before: start }` for an end date. */
  disabledDays?: Matcher;
}

export function DatePicker({ date, onSelectAction, placeholder = "Pick a date", className, disabled, disabledDays }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`justify-start text-left font-normal gap-2 ${className ?? ""}`} disabled={disabled}>
          <CalendarIcon className="size-4" />
          {date ? format(date, "MMM d, yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {/* Month/year dropdowns jump straight to a birthday decades back or a promo months out. */}
        <Calendar
          mode="single"
          selected={date}
          // A pick, or clicking the picked day again to clear it, is a complete choice.
          onSelect={(d) => {
            onSelectAction(d);
            setOpen(false);
          }}
          defaultMonth={date}
          captionLayout="dropdown"
          startMonth={CALENDAR_START_MONTH}
          endMonth={CALENDAR_END_MONTH}
          fixedWeeks
          disabled={disabledDays}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
