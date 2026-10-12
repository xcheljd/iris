import { Badge } from "@/components/ui/badge";
import { Flame, Thermometer, Snowflake } from "lucide-react";

export function HeatBadge({
  level,
  score,
  showScore = false,
  compactOnMobile = false,
}: {
  level: "hot" | "warm" | "cold";
  score?: number;
  showScore?: boolean;
  /** Below md, show icon + score only; the word stays for screen readers. */
  compactOnMobile?: boolean;
}) {
  const Icon = level === "hot" ? Flame : level === "warm" ? Thermometer : Snowflake;
  return (
    <Badge variant={level} className="gap-1">
      <Icon className="size-3" />
      <span className={compactOnMobile ? "capitalize max-md:sr-only" : "capitalize"}>{level}</span>
      {showScore && score !== undefined && <span className="font-mono opacity-80">{score}</span>}
    </Badge>
  );
}
