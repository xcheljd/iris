"use client";

import { useState } from "react";
import type { Matcher } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, startOfDay, startOfMonth } from "date-fns";
import { CALENDAR_END_MONTH, CALENDAR_START_MONTH } from "@/lib/date-presets";

interface DatePickerProps {
  date?: Date;
  onSelectAction: (date?: Date) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Days that can't be picked, e.g. `{ before: start }` for an end date. */
  disabledDays?: Matcher;
  /** Follow-up dates: days before today can't be picked and the year list starts this year. */
  noPastDays?: boolean;
}

export function DatePicker({ date, onSelectAction, placeholder = "Pick a date", className, disabled, disabledDays, noPastDays }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  // Read the clock when the calendar opens, not during render: keeps render
  // pure and picks up a midnight rollover on a page left open overnight.
  const [today, setToday] = useState<Date | null>(null);
  const onOpenChange = (next: boolean) => {
    if (next && noPastDays) setToday(startOfDay(new Date()));
    setOpen(next);
  };
  const minDay = noPastDays ? today : null;
  const blocked: Matcher[] = [];
  if (disabledDays) blocked.push(disabledDays);
  if (minDay) blocked.push({ before: minDay });
  // An overdue follow-up's own date sits before the first allowed month; open on today instead.
  const openMonth = minDay && (!date || date < minDay) ? minDay : date;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
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
          defaultMonth={openMonth}
          captionLayout="dropdown"
          startMonth={minDay ? startOfMonth(minDay) : CALENDAR_START_MONTH}
          endMonth={CALENDAR_END_MONTH}
          fixedWeeks
          disabled={blocked.length === 0 ? undefined : blocked.length === 1 ? blocked[0] : blocked}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
