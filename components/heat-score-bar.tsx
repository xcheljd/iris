"use client";

import { cn } from "@/lib/utils";

interface HeatScoreBarProps {
  score: number;
  className?: string;
}

export function HeatScoreBar({ score, className }: HeatScoreBarProps) {
  const getHeatColor = (score: number) => {
    if (score >= 70) return "bg-orange-500"; // Hot
    if (score >= 40) return "bg-yellow-500"; // Warm
    return "bg-blue-500"; // Cold
  };

  const getHeatLevel = (score: number) => {
    if (score >= 70) return { level: "Hot", color: "text-orange-500" };
    if (score >= 40) return { level: "Warm", color: "text-yellow-500" };
    return { level: "Cold", color: "text-blue-500" };
  };

  const heatLevel = getHeatLevel(score);
  const barColor = getHeatColor(score);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden" aria-label={`Heat score: ${score}`}>
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium">{score}</span>
        <span className={`text-xs font-medium ${heatLevel.color}`}>
          {heatLevel.level}
        </span>
      </div>
    </div>
  );
}