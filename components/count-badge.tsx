import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCount } from "@/hooks/use-follow-up-count";

/*
 * The nav count badges (sidebar list, collapsed-sidebar corner, phone tab bar).
 * Classes are copied VERBATIM from the shipped badges: X approved their
 * centering in real Brave at DPR 1.05 (text-box trim + leading-[normal]; single
 * digits drop px-1 so the corner badge stays a 16px circle, not a 17x16 oval).
 * Don't "tidy" them without re-checking in headed Brave.
 *
 * The badge itself is aria-hidden: screen readers get the count once, with its
 * meaning, from the link's aria-label (countAriaLabel), whichever badge shows.
 */
const VARIANTS = {
  inline: "ml-auto h-5 min-w-5 px-1.5 text-xs tracking-wide tabular-nums group-data-[collapsible=icon]:hidden",
  corner: "pointer-events-none absolute -top-1 -right-1 hidden h-4 min-w-4 px-1 text-[11px] font-medium leading-[normal] [text-box:trim-both_cap_alphabetic] tabular-nums group-data-[collapsible=icon]:flex",
  tab: "pointer-events-none absolute -top-1.5 -right-2.5 h-4 min-w-4 px-1 text-[11px] font-medium leading-[normal] [text-box:trim-both_cap_alphabetic] tabular-nums",
} as const;

export function CountBadge({ count, variant }: { count: number; variant: keyof typeof VARIANTS }) {
  if (count <= 0) return null;
  const text = formatCount(count);
  // Only the small round badges drop padding for one digit.
  const single = variant !== "inline" && text.length === 1;
  return (
    <Badge aria-hidden className={cn(VARIANTS[variant], single && "px-0")}>
      {text}
    </Badge>
  );
}

/** What each nav count means, for screen readers (X's wording, 10/17). */
export type CountKind = "due" | "pending" | "review";

export function countPhrase(count: number, kind: CountKind): string {
  const n = formatCount(count);
  if (kind === "review") return `${n} ${count === 1 ? "needs" : "need"} review`;
  return `${n} ${kind}`;
}

/**
 * Accessible name for a nav link that carries a count ("Follow-Ups, 4 due").
 * Set as the link's aria-label rather than hidden text: an sr-only span is
 * its own box, so the computed name came out "Follow-Ups , 4 due".
 * Undefined when there's no count, so the link keeps its plain name.
 */
export function countAriaLabel(label: string, count: number, kind: CountKind | null): string | undefined {
  return kind && count > 0 ? `${label}, ${countPhrase(count, kind)}` : undefined;
}
