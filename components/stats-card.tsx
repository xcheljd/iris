import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

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
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold ${valueClassName ?? ""}`}>{value}</p>
          </div>
          <Icon className={`h-8 w-8 ${iconClassName ?? "text-muted-foreground"}`} />
        </div>
      </CardContent>
    </Card>
  );
}
