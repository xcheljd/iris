"use client";

import { Button } from "@/components/ui/button";
import { FOLLOW_UP_PRESETS, daysFromToday } from "@/lib/date-presets";

/** One-tap follow-up dates (Tomorrow … 1 month), shared by logging and rescheduling. */
export function FollowUpQuickPicks({ onPick, disabled }: { onPick: (date: Date) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {FOLLOW_UP_PRESETS.map((p) => (
        <Button key={p.label} type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onPick(daysFromToday(p.days))}>
          {p.label}
        </Button>
      ))}
    </div>
  );
}
