"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const heatChartConfig = {
  hot: { label: "Hot", color: "#f97316" },
  warm: { label: "Warm", color: "#eab308" },
  cold: { label: "Cold", color: "#3b82f6" },
} satisfies ChartConfig;

interface HeatDistributionChartProps {
  hot: number;
  warm: number;
  cold: number;
  active: number;
  className?: string;
}

export function HeatDistributionChart({ hot, warm, cold, active, className = "h-[200px] w-full" }: HeatDistributionChartProps) {
  if (active <= 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No active clients to display
      </p>
    );
  }

  return (
    <ChartContainer config={heatChartConfig} className={className}>
      <BarChart
        data={[
          { level: "Hot", count: hot, fill: "var(--color-hot)" },
          { level: "Warm", count: warm, fill: "var(--color-warm)" },
          { level: "Cold", count: cold, fill: "var(--color-cold)" },
        ]}
        layout="vertical"
        margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="level" width={50} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
