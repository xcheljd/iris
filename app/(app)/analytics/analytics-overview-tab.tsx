"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { HeatDistributionChart } from "@/components/heat-distribution-chart";
import {
  Users,
  Flame,
  Phone,
  Target,
  ShoppingCart,
  MailX,
  Ban,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";

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
  conversionRate: number;
  /** Outreach methods counted over the same range as the cards. */
  methodDistribution: MethodDistribution[];
  /** The picked range for the outreach cards: "All time", "Last 30 days", "May 1 – May 31, 2026". */
  rangeLabel: string;
}

export function AnalyticsOverviewTab({ stats, conversionRate, methodDistribution, rangeLabel }: AnalyticsOverviewTabProps) {
  // Client counts are point-in-time; only the outreach/purchase cards follow the range.
  const inRange = rangeLabel === "All time" ? "all time" : rangeLabel;
  return (
    <div className="flex flex-col gap-6">
      {/* Key Metrics with HoverCards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-default">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Clients</p>
                    <p className="text-2xl font-bold">{stats.total}</p>
                  </div>
                  <Users className="size-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-64">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Client Breakdown</p>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Active</span>
                <span className="font-medium">{stats.active}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Inactive</span>
                <span className="font-medium">{stats.total - stats.active}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Hot</span><span>{stats.hot}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Warm</span><span>{stats.warm}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Cold</span><span>{stats.cold}</span>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>

        <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-default">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Outreach</p>
                    <p className="text-xs text-muted-foreground">{inRange}</p>
                    <p className="text-2xl font-bold">{stats.outreachWeek}</p>
                  </div>
                  <Phone className="size-8 text-info" />
                </div>
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-64">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Outreach Methods ({inRange})</p>
              <Separator />
              {methodDistribution.map((m) => (
                <div key={m.method} className="flex justify-between text-sm">
                  <span className="text-muted-foreground capitalize">{m.label}</span>
                  <span className="font-medium">{m.count}</span>
                </div>
              ))}
            </div>
          </HoverCardContent>
        </HoverCard>

        <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-default">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Purchases</p>
                    <p className="text-xs text-muted-foreground">{inRange}</p>
                    <p className="text-2xl font-bold text-success">{stats.purchasesWeek}</p>
                  </div>
                  <ShoppingCart className="size-8 text-success" />
                </div>
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-64">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Conversion Funnel</p>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Outreach</span>
                <span className="font-medium">{stats.outreachWeek}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Purchases</span>
                <span className="font-medium text-success">{stats.purchasesWeek}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Conversion Rate</span>
                <span className="font-medium">{conversionRate}%</span>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>

        <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-default">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Conversion</p>
                    <p className="text-xs text-muted-foreground">{inRange}</p>
                    <p className="text-2xl font-bold">{conversionRate}%</p>
                  </div>
                  <Target className="size-8 text-warning" />
                </div>
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-64">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Conversion Rate</p>
              <Separator />
              <p className="text-xs text-muted-foreground">
                {stats.purchasesWeek} purchase{stats.purchasesWeek !== 1 ? "s" : ""} from{" "}
                {stats.outreachWeek} outreach attempt{stats.outreachWeek !== 1 ? "s" : ""} ({inRange}).
              </p>
              <Progress value={conversionRate} className="h-2 mt-2" aria-label="Conversion rate" />
            </div>
          </HoverCardContent>
        </HoverCard>
      </div>

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

      {/* Conversion Metrics with Progress Bars */}
      <Card>
        <CardHeader>
          <CardTitle>Conversion Metrics</CardTitle>
          <CardDescription>Outreach effectiveness, {inRange}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span>Conversion Rate</span>
              <span className="font-medium">{conversionRate}%</span>
            </div>
            <Progress value={conversionRate} className="h-2" aria-label="Conversion rate" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span>Outreach Completion</span>
              <span className="font-medium">
                {stats.outreachWeek > 0 ? "100%" : "0%"}
              </span>
            </div>
            <Progress value={stats.outreachWeek > 0 ? 100 : 0} className="h-2" aria-label="Outreach completion" />
          </div>
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
