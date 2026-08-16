import { Badge } from "@/components/ui/badge";
import { Flame, Thermometer, Snowflake } from "lucide-react";

export function HeatBadge({ level, score, showScore = false }: { level: "hot" | "warm" | "cold"; score?: number; showScore?: boolean }) {
  const Icon = level === "hot" ? Flame : level === "warm" ? Thermometer : Snowflake;
  return (
    <Badge variant={level} className="gap-1">
      <Icon className="size-3" />
      <span className="capitalize">{level}</span>
      {showScore && score !== undefined && <span className="font-mono opacity-80">{score}</span>}
    </Badge>
  );
}
