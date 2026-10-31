import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconClassName?: string;
  valueClassName?: string;
}

export function StatsCard({ label, value, icon: Icon, iconClassName, valueClassName }: StatsCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <CardDescription>{label}</CardDescription>
          <CardTitle className={cn("text-2xl font-bold", valueClassName)}>{value}</CardTitle>
        </div>
        <Icon className={cn("size-8 shrink-0", iconClassName ?? "text-muted-foreground")} />
      </CardHeader>
    </Card>
  );
}
