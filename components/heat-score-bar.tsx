"use client";

import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

interface HeatScoreBarProps {
  score: number;
  className?: string;
}

export function HeatScoreBar({ score, className }: HeatScoreBarProps) {
  const heatConfig = score >= 70
    ? { level: "Hot", indicatorColor: "[&>div]:bg-orange-500", textColor: "text-orange-500" }
    : score >= 40
      ? { level: "Warm", indicatorColor: "[&>div]:bg-yellow-500", textColor: "text-yellow-500" }
      : { level: "Cold", indicatorColor: "[&>div]:bg-blue-500", textColor: "text-blue-500" };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Progress value={score} className={cn("flex-1", heatConfig.indicatorColor)} aria-label={`Heat score: ${score}`} />
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium">{score}</span>
        <span className={cn("text-xs font-medium", heatConfig.textColor)}>
          {heatConfig.level}
        </span>
      </div>
    </div>
  );
}