"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Flame, Snowflake, Sun } from "lucide-react";

interface Stats {
  total: number;
  active: number;
  hot: number;
  warm: number;
  cold: number;
  banned: number;
  unsubscribed: number;
  outreachWeek: number;
  purchasesWeek: number;
}

interface AnalyticsHeatTabProps {
  stats: Stats;
}

export function AnalyticsHeatTab({ stats }: AnalyticsHeatTabProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Heat Score Insights</CardTitle>
          <CardDescription>
            Understanding your client engagement distribution
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Visual Stacked Bar */}
          <div className="flex rounded-lg overflow-hidden h-10">
            {stats.active > 0 ? (
              <>
                <div
                  className="bg-orange-500 flex items-center justify-center text-white text-xs font-medium transition-all"
                  style={{ width: `${(stats.hot / stats.active) * 100}%` }}
                >
                  {stats.hot > 0 ? `${stats.hot} Hot` : ""}
                </div>
                <div
                  className="bg-yellow-500 flex items-center justify-center text-white text-xs font-medium transition-all"
                  style={{ width: `${(stats.warm / stats.active) * 100}%` }}
                >
                  {stats.warm > 0 ? `${stats.warm} Warm` : ""}
                </div>
                <div
                  className="bg-blue-500 flex items-center justify-center text-white text-xs font-medium transition-all"
                  style={{ width: `${(stats.cold / stats.active) * 100}%` }}
                >
                  {stats.cold > 0 ? `${stats.cold} Cold` : ""}
                </div>
              </>
            ) : (
              <div className="bg-muted flex-1 flex items-center justify-center text-muted-foreground text-sm">
                No data
              </div>
            )}
          </div>

          <Separator />

          {/* Heat Progress Bars */}
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-medium">Hot</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{stats.hot}</span>
                  <span className="text-xs text-muted-foreground">
                    ({stats.active > 0 ? Math.round((stats.hot / stats.active) * 100) : 0}%)
                  </span>
                </div>
              </div>
              <Progress value={stats.active > 0 ? (stats.hot / stats.active) * 100 : 0} className="h-3 [&>div]:bg-orange-500" aria-label="Hot clients percentage" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sun className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm font-medium">Warm</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{stats.warm}</span>
                  <span className="text-xs text-muted-foreground">
                    ({stats.active > 0 ? Math.round((stats.warm / stats.active) * 100) : 0}%)
                  </span>
                </div>
              </div>
              <Progress value={stats.active > 0 ? (stats.warm / stats.active) * 100 : 0} className="h-3 [&>div]:bg-yellow-500" aria-label="Warm clients percentage" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Snowflake className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Cold</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{stats.cold}</span>
                  <span className="text-xs text-muted-foreground">
                    ({stats.active > 0 ? Math.round((stats.cold / stats.active) * 100) : 0}%)
                  </span>
                </div>
              </div>
              <Progress value={stats.active > 0 ? (stats.cold / stats.active) * 100 : 0} className="h-3 [&>div]:bg-blue-500" aria-label="Cold clients percentage" />
            </div>
          </div>

          <Separator />

          {/* Legend */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1">
                <Flame className="h-4 w-4 text-orange-500" />
                <span className="font-medium">Hot</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {stats.hot} client{stats.hot !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Highly engaged, recent interaction
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1">
                <Sun className="h-4 w-4 text-yellow-500" />
                <span className="font-medium">Warm</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {stats.warm} client{stats.warm !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Moderate engagement
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1">
                <Snowflake className="h-4 w-4 text-blue-500" />
                <span className="font-medium">Cold</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {stats.cold} client{stats.cold !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Needs re-engagement
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
