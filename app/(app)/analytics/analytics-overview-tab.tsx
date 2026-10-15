"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { HeatDistributionChart } from "@/components/heat-distribution-chart";
import {
  Flame,
  MailX,
  Ban,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import type { KpiMetrics } from "@/lib/queries";
import { OverviewKpis } from "./overview-kpis";

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

interface MethodDistribution {
  method: string;
  count: number;
  label: string;
}

interface AnalyticsOverviewTabProps {
  stats: Stats;
  /** Outreach methods counted over the same range as the cards. */
  methodDistribution: MethodDistribution[];
  /** The picked range for the outreach cards: "All time", "Last 30 days", "May 1 – May 31, 2026". */
  rangeLabel: string;
  /** Conversion, follow-up completion and trends over the same range. */
  kpis: KpiMetrics;
}

export function AnalyticsOverviewTab({ stats, methodDistribution, rangeLabel, kpis }: AnalyticsOverviewTabProps) {
  // Client counts are point-in-time; the outreach, conversion and follow-up figures follow the range.
  const inRange = rangeLabel === "All time" ? "all time" : rangeLabel;
  return (
    <div className="flex flex-col gap-6">
      <OverviewKpis kpis={kpis} total={stats.total} active={stats.active} methods={methodDistribution} inRange={inRange} />

      <Separator />

      {/* Heat Distribution Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="size-5" />
            Client Heat Distribution
          </CardTitle>
          <CardDescription>
            {stats.active} active clients by engagement level
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HeatDistributionChart hot={stats.hot} warm={stats.warm} cold={stats.cold} active={stats.active} />
        </CardContent>
      </Card>

      {/* Compliance Cards: stacked on phones, where two across can't fit the label and View link. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Ban className="size-4 text-destructive" />
                  <p className="text-sm text-muted-foreground">Banned</p>
                </div>
                <p className="text-2xl font-bold text-destructive mt-1">{stats.banned}</p>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/banned">
                  View <ChevronRight className="size-4 ml-1" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <MailX className="size-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Unsubscribed</p>
                </div>
                <p className="text-2xl font-bold mt-1">{stats.unsubscribed}</p>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/unsubscribed">
                  View <ChevronRight className="size-4 ml-1" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
