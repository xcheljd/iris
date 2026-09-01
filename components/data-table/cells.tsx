import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { HeatBadge } from "@/components/heat-badge";
import { TableCell } from "@/components/ui/table";
import { cn, formatDate, formatDaysAgo, formatMoney } from "@/lib/utils";

/**
 * The shared cell vocabulary for Iris' `<Table>` surfaces.
 *
 * Every renderer here emits its own `<TableCell>` so that the alignment,
 * numeric-font and muted-fallback decisions live in exactly one place instead
 * of being re-typed per column. They are pure presentational components — props
 * in, JSX out, no hooks, no data access — so they work in server and client
 * components alike and are trivially unit-testable.
 *
 * `className` is merged last on every cell, which is how callers keep their
 * responsive-visibility classes (`hidden md:table-cell`) and override a default
 * (twMerge resolves `text-xs` → `text-sm`).
 */

/** A missing value. Always the muted em dash — never "0", never blank. */
function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

function isBlank(value: ReactNode): boolean {
  return value == null || value === "";
}

/** Text, or a muted em dash when the value is null/empty. */
export function TextCell({ value, className }: { value: ReactNode; className?: string }) {
  return <TableCell className={className}>{isBlank(value) ? <Dash /> : value}</TableCell>;
}

/** `TextCell` for identifiers — model numbers, SKUs — in the monospace face. */
export function MonoCell({ value, className }: { value: ReactNode; className?: string }) {
  return <TextCell value={value} className={cn("font-mono text-sm", className)} />;
}

/**
 * USD, right-aligned and tabular so digits line up down the column.
 * `emphasis="sale"` is the discounted-price treatment; `note` is the small
 * amber caveat the promo import shows under an amount.
 */
export function MoneyCell({
  value,
  emphasis,
  note,
  className,
}: {
  value: number | null | undefined;
  emphasis?: "sale";
  note?: ReactNode;
  className?: string;
}) {
  return (
    <TableCell className={cn("text-right tabular-nums", emphasis === "sale" && "font-medium text-green-500", className)}>
      {value == null ? <Dash /> : formatMoney(value)}
      {note}
    </TableCell>
  );
}

/** A whole-number percentage ("15%"), right-aligned and tabular. */
export function PercentCell({ value, className }: { value: number | null | undefined; className?: string }) {
  return (
    <TableCell className={cn("text-right tabular-nums", className)}>
      {value == null ? <Dash /> : `${value}%`}
    </TableCell>
  );
}

/**
 * "How long ago", as text — "Today", "12d ago", "Never". Never a bare number:
 * a column of unlabelled integers reads as a count, not an age.
 */
export function RelativeDateCell({
  value,
  className,
}: {
  value: Date | string | number | null | undefined;
  className?: string;
}) {
  return <TableCell className={cn("text-xs text-muted-foreground", className)}>{formatDaysAgo(value)}</TableCell>;
}

/**
 * An absolute date ("Aug 31, 2026"), optionally with the relative age stacked
 * underneath it.
 */
export function DateTimeCell({
  value,
  showRelative = false,
  className,
}: {
  value: Date | string | number | null | undefined;
  showRelative?: boolean;
  className?: string;
}) {
  return (
    <TableCell className={cn("text-xs text-muted-foreground", className)}>
      {value == null ? (
        <Dash />
      ) : (
        <>
          <div>{formatDate(value)}</div>
          {showRelative && <div>{formatDaysAgo(value)}</div>}
        </>
      )}
    </TableCell>
  );
}

/**
 * A single badge in its own cell — status, role, source, match type, count.
 * A null/empty label renders an empty cell rather than a dash, because these
 * columns mean "nothing to flag here", not "value missing". `0` is a real
 * label and does render.
 */
export function StatusBadgeCell({
  label,
  variant = "secondary",
  capitalize = false,
  className,
}: {
  label: ReactNode;
  variant?: BadgeProps["variant"];
  capitalize?: boolean;
  className?: string;
}) {
  return (
    <TableCell className={className}>
      {isBlank(label) ? null : (
        <Badge variant={variant} className={capitalize ? "capitalize" : undefined}>
          {label}
        </Badge>
      )}
    </TableCell>
  );
}

/** The heat badge in its own cell. */
export function HeatBadgeCell({
  level,
  score,
  showScore = false,
  className,
}: {
  level: "hot" | "warm" | "cold";
  score?: number;
  showScore?: boolean;
  className?: string;
}) {
  return (
    <TableCell className={className}>
      <HeatBadge level={level} score={score} showScore={showScore} />
    </TableCell>
  );
}

/**
 * A yes/no flag as a check or a muted em dash. Both glyphs carry an sr-only
 * word, because "✓ vs —" is invisible to a screen reader.
 */
export function BooleanCell({ value, className }: { value: boolean; className?: string }) {
  return (
    <TableCell className={cn("text-center", className)}>
      {value ? <Check className="inline-block size-4" aria-hidden /> : <Dash />}
      <span className="sr-only">{value ? "Yes" : "No"}</span>
    </TableCell>
  );
}
